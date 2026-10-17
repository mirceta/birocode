// Where "open harness" puts an agent's tab (openspec management-settings-tab, superseded in part by
// openspec harness-tabs-left-window, fleet task d3af3b9b). Device-local, like every Management App layout
// setting:
//
//   - "left" (default): the agent's tab lands in the OTHER Chrome window, through the harness HOST tab that
//              lives there (harnessHost.js — read its header for what a page can and cannot control and
//              why the earlier name / launcher / popup-window designs lost the window after a refresh);
//   - "tabs":  the agent's tab opens beside the dashboard, in its own window (workerWindow.js).
//
// The earlier "window" mode (a dedicated popup window placed on a chosen screen, then a launcher tab
// reached by name) is read as "left": it was the same wish, and both of its mechanisms were what failed.

export { HOST_TAB_NAME as HARNESS_WINDOW_NAME, hostUrl as launcherUrl, isHostPage as isLauncherPage } from './harnessHost.js';

// A new key on purpose: the old one ('manageapp.harnessWindow') may hold the earlier default 'tabs', and the
// Operator's ask is that every machine lands left from now on; 'tabs' stays one explicit choice away.
export const PLACEMENT_KEY = 'manageapp.harnessPlacement.v2';
export const MODES = ['left', 'tabs'];

/** The persisted choice: { mode }. Unknown / broken storage, and the retired "window" mode, read as "left". */
export function readPlacement(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage?.getItem(PLACEMENT_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return { mode: v?.mode === 'tabs' ? 'tabs' : 'left' };
  } catch {
    return { mode: 'left' };
  }
}

export function savePlacement(p, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const clean = { mode: MODES.includes(p?.mode) ? p.mode : 'left' };
  try { storage?.setItem(PLACEMENT_KEY, JSON.stringify(clean)); } catch { /* private mode */ }
  return clean;
}
