import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';
import { readTabState, writeTabState } from '../api/viewState';
import { useRepo } from './RepoContext';

// The tab list itself is backend-owned (GET/POST/PATCH/DELETE /api/dock) so
// every device shows the same agents (see plans/dock-sync.md). Only which tab
// this browser tab is LOOKING at stays local — and it is per-browser-tab
// (sessionStorage via viewState.js), so two tabs on one machine each keep their
// own active agent instead of clobbering each other on refresh.
const LEGACY_DOCK_KEY = 'claudeweb_dock'; // pre-sync localStorage tab list
const ACTIVE_KEY = 'claudeweb_dock_active';
// Which chat surface this browser tab is looking at (plans/dual-chat.md):
// 'agent' = the active dock tab (or the plain default chat when none exist),
// 'project' = the project-following chat, 'harness' = the always-on Claude Web
// chat. Tab-local by design, like ACTIVE_KEY.
const VIEW_KEY = 'claudeweb_chat_view';

const DockContext = createContext(null);

export function useDock() {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useDock must be used within a <DockProvider>');
  return ctx;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readLegacyTabs() {
  try {
    const raw = localStorage.getItem(LEGACY_DOCK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Only these fields live on the backend; anything else in a patch is
// client-local and must not be PATCHed.
function toServerPatch(patch) {
  const body = {};
  if ('sessionId' in patch) body.sessionId = patch.sessionId ?? '';
  if ('status' in patch) body.status = patch.status;
  if ('repoName' in patch) body.repoName = patch.repoName;
  // Empty string clears the colour mark on the backend (see DockRegistry.Update).
  if ('color' in patch) body.color = patch.color ?? '';
  // Whether the agent shows on the Dashboard (toggled from the Agents tab).
  if ('dashboard' in patch) body.dashboard = patch.dashboard;
  return Object.keys(body).length > 0 ? body : null;
}

export function DockProvider({ children }) {
  const { repos, selectRepo } = useRepo();
  const [tabs, setTabs] = useState([]);
  // True once the first successful fetch landed; ChatContext defers its run
  // reconciliation until then (before that the tab list is simply unknown).
  const [loaded, setLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState(() => readTabState(ACTIVE_KEY) || null);
  const [chatView, setChatViewState] = useState(() => {
    const stored = readTabState(VIEW_KEY);
    return stored === 'project' || stored === 'harness' || stored === 'ask' ? stored : 'agent';
  });

  const setChatView = useCallback((view) => {
    writeTabState(VIEW_KEY, view);
    setChatViewState(view);
  }, []);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const refresh = useCallback(async () => {
    let list;
    try {
      list = await apiGet('/dock');
      if (!Array.isArray(list)) list = [];

      // One-time migration: push this device's legacy localStorage tabs to the
      // empty backend (keeping ids, which double as conversation keys).
      if (list.length === 0) {
        const legacy = readLegacyTabs();
        if (legacy.length > 0) {
          for (const t of legacy) {
            try {
              await apiPost('/dock', {
                id: t.id,
                repoId: t.repoId,
                repoName: t.repoName,
                sessionId: t.sessionId,
                status: t.status,
                createdAt: t.createdAt,
              });
            } catch {
              /* skip broken entries */
            }
          }
          list = await apiGet('/dock');
        }
      }
      localStorage.removeItem(LEGACY_DOCK_KEY);
    } catch {
      // Offline or auth hiccup: keep the last good list, try again on the
      // next visibility change.
      return;
    }

    setTabs(list);
    setLoaded(true);
    setActiveTabId((prev) => {
      if (prev && list.some((t) => t.id === prev)) return prev;
      return list.length > 0 ? list[0].id : null;
    });
  }, []);

  // Load on mount and whenever the page becomes visible again, mirroring the
  // run reconciliation in ChatContext, so devices converge when looked at.
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Persist which tab this browser tab is viewing (tab-local by design — see
  // viewState.js, so two tabs on one machine stay independent).
  useEffect(() => {
    writeTabState(ACTIVE_KEY, activeTabId);
  }, [activeTabId]);

  const openTab = useCallback((repoId, repoName) => {
    const id = genId();
    const tab = {
      id,
      repoId,
      repoName,
      sessionId: null,
      status: 'idle',
      createdAt: Date.now(),
    };
    // Optimistic: show the tab now, sync in the background. The backend keeps
    // the client id so the conversation key is stable across devices.
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
    setChatView('agent');
    // A new agent is tied to its repo — follow it with the global project
    // selector so Git/Files/etc. show that project (plans/agent-repo-sync.md).
    selectRepo(repoId);
    apiPost('/dock', tab).catch(() => {
      setTabs((prev) => prev.filter((t) => t.id !== id));
    });
    return id;
  }, [selectRepo, setChatView]);

  const closeTab = useCallback((id) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveTabId((prevActive) => {
      if (prevActive !== id) return prevActive;
      const remaining = tabsRef.current.filter((t) => t.id !== id);
      return remaining.length > 0 ? remaining[0].id : null;
    });
    apiDelete(`/dock/${id}`).catch(() => {
      /* already gone on the backend (e.g. closed from another device) */
    });
  }, []);

  // Explicitly selecting an agent also selects its project globally
  // (plans/agent-repo-sync.md). One-directional: the project selector never
  // changes the active agent, and the implicit first-tab fallback in
  // refresh() does not sync (loading the app must not override the device's
  // project selection).
  const setActiveTab = useCallback((id) => {
    setActiveTabId(id);
    setChatView('agent');
    const tab = tabsRef.current.find((t) => t.id === id);
    if (tab?.repoId) selectRepo(tab.repoId);
  }, [selectRepo, setChatView]);

  // Prompt stash (plans/prompt-stash.md): ideas jotted down while the agent
  // runs, attached to the tab on the backend. Optimistic, client-supplied id
  // (same pattern as openTab).
  const addStash = useCallback((tabId, text) => {
    const item = { id: genId(), text, createdAt: Date.now() };
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, stash: [...(t.stash || []), item] } : t)),
    );
    apiPost(`/dock/${tabId}/stash`, item).catch(() => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, stash: (t.stash || []).filter((s) => s.id !== item.id) } : t,
        ),
      );
    });
  }, []);

  const removeStash = useCallback((tabId, stashId) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, stash: (t.stash || []).filter((s) => s.id !== stashId) } : t,
      ),
    );
    apiDelete(`/dock/${tabId}/stash/${stashId}`).catch(() => {
      /* already gone on the backend; the next refresh re-syncs */
    });
  }, []);

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
    const body = toServerPatch(patch);
    if (body) {
      apiPatch(`/dock/${id}`, body).catch(() => {
        /* transient; the next refresh re-syncs */
      });
    }
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const value = {
    tabs,
    loaded,
    activeTabId,
    activeTab,
    chatView,
    setChatView,
    openTab,
    closeTab,
    setActiveTab,
    updateTab,
    addStash,
    removeStash,
    repos,
  };

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}
