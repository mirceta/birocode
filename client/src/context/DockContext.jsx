import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRepo } from './RepoContext';

const DOCK_KEY = 'claudeweb_dock';
const DockContext = createContext(null);

export function useDock() {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useDock must be used within a <DockProvider>');
  return ctx;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadTabs() {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    if (!raw) return [];
    // Keep stored statuses as-is (including "running"): runs are backend-owned
    // and survive reloads. ChatProvider reconciles against GET /api/runs.
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTabs(tabs) {
  try {
    localStorage.setItem(DOCK_KEY, JSON.stringify(tabs));
  } catch {
    /* quota exceeded or private mode */
  }
}

export function DockProvider({ children }) {
  const { repos } = useRepo();
  const [tabs, setTabs] = useState(loadTabs);
  const [activeTabId, setActiveTabId] = useState(() => {
    const loaded = loadTabs();
    return loaded.length > 0 ? loaded[0].id : null;
  });

  // Persist whenever tabs change.
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
    saveTabs(tabs);
  }, [tabs]);

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
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((id) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      return next;
    });
    setActiveTabId((prevActive) => {
      if (prevActive !== id) return prevActive;
      const remaining = tabsRef.current.filter((t) => t.id !== id);
      return remaining.length > 0 ? remaining[0].id : null;
    });
  }, []);

  const setActiveTab = useCallback((id) => {
    setActiveTabId(id);
  }, []);

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const value = {
    tabs,
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
