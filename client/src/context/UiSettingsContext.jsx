import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/client';

// Backend-synced UI settings (plans/settings-tab.md): tab order lives on the
// server because the user works from phone and desktop interchangeably.
// Empty tabOrder = default order. Saves are optimistic — the nav reorders
// instantly, the PUT follows.
// tabWidths (plans/pane-widths.md): tab key -> pane span 1-4, absent = 1.
// hiddenTabs (plans/tab-visibility.md): keys hidden from the advanced nav.
const UiSettingsContext = createContext(null);

export function useUiSettings() {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) throw new Error('useUiSettings must be used within a <UiSettingsProvider>');
  return ctx;
}

export function UiSettingsProvider({ children }) {
  const [tabOrder, setTabOrderState] = useState([]);
  const [tabWidths, setTabWidthsState] = useState({});
  const [hiddenTabs, setHiddenTabsState] = useState([]);

  useEffect(() => {
    apiGet('/settings/ui')
      .then((s) => {
        setTabOrderState(s.tabOrder || []);
        setTabWidthsState(s.tabWidths || {});
        setHiddenTabsState(s.hiddenTabs || []);
      })
      .catch(() => { /* defaults until the next load */ });
  }, []);

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
