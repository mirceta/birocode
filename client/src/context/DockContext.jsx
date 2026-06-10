import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';
import { useRepo } from './RepoContext';

// The tab list itself is backend-owned (GET/POST/PATCH/DELETE /api/dock) so
// every device shows the same agents (see plans/dock-sync.md). Only which tab
// this device is LOOKING at stays local.
const LEGACY_DOCK_KEY = 'claudeweb_dock'; // pre-sync localStorage tab list
const ACTIVE_KEY = 'claudeweb_dock_active';

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
  return Object.keys(body).length > 0 ? body : null;
}

export function DockProvider({ children }) {
  const { repos } = useRepo();
  const [tabs, setTabs] = useState([]);
  // True once the first successful fetch landed; ChatContext defers its run
  // reconciliation until then (before that the tab list is simply unknown).
  const [loaded, setLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState(() => localStorage.getItem(ACTIVE_KEY) || null);

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

  // Persist which tab this device is viewing (device-local by design).
  useEffect(() => {
    if (activeTabId) localStorage.setItem(ACTIVE_KEY, activeTabId);
    else localStorage.removeItem(ACTIVE_KEY);
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
    apiPost('/dock', tab).catch(() => {
      setTabs((prev) => prev.filter((t) => t.id !== id));
    });
    return id;
  }, []);

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

  const setActiveTab = useCallback((id) => {
    setActiveTabId(id);
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
    openTab,
    closeTab,
    setActiveTab,
    updateTab,
    repos,
  };

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}
