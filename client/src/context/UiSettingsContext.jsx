import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/client';

// Backend-synced UI settings (plans/settings-tab.md): tab order lives on the
// server because the user works from phone and desktop interchangeably.
// Empty tabOrder = default order. Saves are optimistic — the nav reorders
// instantly, the PUT follows.
const UiSettingsContext = createContext(null);

export function useUiSettings() {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) throw new Error('useUiSettings must be used within a <UiSettingsProvider>');
  return ctx;
}

export function UiSettingsProvider({ children }) {
  const [tabOrder, setTabOrderState] = useState([]);

  useEffect(() => {
    apiGet('/settings/ui')
      .then((s) => setTabOrderState(s.tabOrder || []))
      .catch(() => { /* default order until the next load */ });
  }, []);

  const saveTabOrder = useCallback((order) => {
    setTabOrderState(order); // optimistic — the nav obeys immediately
    apiPut('/settings/ui', { tabOrder: order }).catch(() => { /* re-fetched next load */ });
  }, []);

  return (
    <UiSettingsContext.Provider value={{ tabOrder, saveTabOrder }}>
      {children}
    </UiSettingsContext.Provider>
  );
}
