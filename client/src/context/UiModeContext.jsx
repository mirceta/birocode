import { createContext, useCallback, useContext, useState } from 'react';

// UI Modes — Basic / Advanced (see plans/ui-modes.md).
//
// Basic Mode is the End User's clean messaging-app view; Advanced Mode exposes
// the Operator/developer features. The mode is device-local (localStorage),
// default Basic. Components never compare uiMode directly — they ask
// useFeature('name') against the Capability Map below, so moving a feature
// between modes is a one-line change here.
//
// Convention: new features default to 'advanced' unless their plan explicitly
// promotes them to 'basic'.
export const FEATURES = {
  chat: 'basic',
  files: 'basic',
  history: 'basic',
  saveButton: 'basic',
  languageToggle: 'basic',
  appTab: 'advanced',
  repoSelector: 'advanced',
  modelSelector: 'advanced',
  agentDock: 'advanced', // and the future Agents tab
  buildStamp: 'advanced',
};

const MODE_KEY = 'claudeweb_ui_mode';
const UiModeContext = createContext(null);

export function useUiMode() {
  const ctx = useContext(UiModeContext);
  if (!ctx) throw new Error('useUiMode must be used within a <UiModeProvider>');
  return ctx;
}

// True when the feature is visible in the current mode.
export function useFeature(name) {
  const { uiMode } = useUiMode();
  return FEATURES[name] === 'basic' || uiMode === 'advanced';
}

export function UiModeProvider({ children }) {
  const [uiMode, setUiModeState] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'basic';
    } catch {
      return 'basic';
    }
  });

  const setUiMode = useCallback((mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* private mode */
    }
    setUiModeState(mode);
  }, []);

  const value = { uiMode, isAdvanced: uiMode === 'advanced', setUiMode };
  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>;
}
