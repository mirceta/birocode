import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/client';
import { useRepo } from './RepoContext';

// Backend-synced UI settings (plans/settings-tab.md): tab order lives on the
// server because the user works from phone and desktop interchangeably.
// Empty tabOrder = default order. Saves are optimistic — the nav reorders
// instantly, the PUT follows.
// tabWidths (plans/pane-widths.md): tab key -> pane span 1-4, absent = 1.
// hiddenTabs (plans/tab-visibility.md): keys hidden from the advanced nav.
//
// Per-project (plans/browser-scoped-tab-order.md): the settings are stored per
// project on the backend, keyed by the X-Repo-Id header the api client already
// sends. So we re-fetch whenever the selected project changes, and a save lands
// under the active project. Mounted INSIDE RepoProvider so it can see the
// selection.
const UiSettingsContext = createContext(null);

export function useUiSettings() {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) throw new Error('useUiSettings must be used within a <UiSettingsProvider>');
  return ctx;
}

export function UiSettingsProvider({ children }) {
  const { currentRepoId } = useRepo();
  const [tabOrder, setTabOrderState] = useState([]);
  const [tabWidths, setTabWidthsState] = useState({});
  const [hiddenTabs, setHiddenTabsState] = useState([]);

  // Load the active project's layout, and reload when the project changes
  // (the api client sends the current X-Repo-Id, so the backend returns that
  // project's settings).
  useEffect(() => {
    apiGet('/settings/ui')
      .then((s) => {
        setTabOrderState(s.tabOrder || []);
        setTabWidthsState(s.tabWidths || {});
        setHiddenTabsState(s.hiddenTabs || []);
      })
      .catch(() => { /* defaults until the next load */ });
  }, [currentRepoId]);

  const saveTabOrder = useCallback((order) => {
    setTabOrderState(order); // optimistic — the nav obeys immediately
    apiPut('/settings/ui', { tabOrder: order }).catch(() => { /* re-fetched next load */ });
  }, []);

  const saveTabWidths = useCallback((order, widths) => {
    setTabWidthsState(widths); // optimistic — the strip obeys immediately
    apiPut('/settings/ui', { tabOrder: order, tabWidths: widths }).catch(() => { /* re-fetched next load */ });
  }, []);

  const saveHiddenTabs = useCallback((order, hidden) => {
    setHiddenTabsState(hidden); // optimistic — the nav obeys immediately
    apiPut('/settings/ui', { tabOrder: order, hiddenTabs: hidden }).catch(() => { /* re-fetched next load */ });
  }, []);

  return (
    <UiSettingsContext.Provider value={{ tabOrder, tabWidths, hiddenTabs, saveTabOrder, saveTabWidths, saveHiddenTabs }}>
      {children}
    </UiSettingsContext.Provider>
  );
}
