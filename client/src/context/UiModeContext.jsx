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
  projectsTab: 'basic', // projects list + add + header chip (plans/projects-tab.md) — promoted to basic 2026-06-11 at End User request
  modelSelector: 'advanced',
  agentDock: 'advanced', // and the future Agents tab
  buildStamp: 'advanced',
  contextMeter: 'advanced', // ctx pill in the chat header (plans/context-meter.md)
  gitTab: 'advanced', // git status tab (plans/git-tab.md)
  gitActions: 'advanced', // inward-sync buttons in the Git tab (plans/git-actions.md)
  gitBranchList: 'advanced', // other-branches overview in the Git tab (plans/git-branches.md)
  gitGraphView: 'advanced', // mermaid history graph in the Git tab (plans/git-graph.md)
  gitBranchReview: 'advanced', // branch "PR preview" in the Git tab (plans/git-pr-preview.md)
  screenTab: 'advanced', // host-desktop snapshots (plans/screen-tab.md)
  machineName: 'advanced', // header title shows "machine · project · branch"
  multiPane: 'advanced', // side-by-side desktop panes (plans/multi-pane.md)
  promptStash: 'advanced', // stash prompt ideas mid-run in the composer (plans/prompt-stash.md)
  terminalTab: 'advanced', // live PowerShell on a ConPTY (plans/terminal-tab.md) — real Administrator shell, never promote to basic
  guestsTab: 'advanced', // IP allowlist inspection: view + unlist only, never approve (plans/auth-ip-filter.md)
  helloButton: 'advanced', // inert HELLO header button (user request 2026-06-12, no plan file)
  settingsTab: 'advanced', // app preferences incl. tab order (plans/settings-tab.md)
  docLinks: 'advanced', // doc links + history in the Files viewer (plans/doc-viewer.md slice 2)
  dualChat: 'advanced', // Project | Claude Web chat switcher (plans/dual-chat.md)
  localAppTab: 'advanced', // direct-iframe Local tab, per-project port (plans/local-app-tab.md)
  ideasTab: 'advanced', // per-project notes (plans/ideas-tab.md)
  understandingPanel: 'advanced', // restatement-of-request panel atop chat (plans/understanding-panel.md)
  deploysTab: 'advanced', // deploy status + rollback control (plans/deployments-tab.md)
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
