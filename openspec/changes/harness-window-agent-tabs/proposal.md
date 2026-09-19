# Harness window: one tab per repo agent — focus an open tab instead of reloading it

## Why

The Settings tab's "one dedicated harness window" (openspec management-settings-tab) is one
viewer: opening agent A, then B, then A again re-navigates the same tab — a refresh, with the
scroll and state lost. The Operator wants each agent in its own tab inside that window, the
first click loading it and every later click only focusing it.

## What a web page can do about it (measured)

`.claudeweb-preview/playwright/check-harness-tabs.mjs` (headed Chrome, the popup blocker ON,
window ids read through CDP):

- a tab lands in the window of the **page that called `window.open`** — so agent tabs can
  only be put inside the harness window by a page living in that window;
- Chrome **never adds tabs to a popup-style window**: a tab opened from a launcher inside the
  placed (popup) viewer landed in the dashboard's window;
- from a launcher in a **normal** window, agent tabs land next to the launcher, a re-click
  focuses without reload — and the popup blocker lets the launcher open only the first tab
  per click it received itself; with **pop-ups allowed for the site** every tab opens.

## What changes

- `window` mode gains a viewer choice (`manageapp.harnessWindow.viewer`):
  - **tabs** (new default): the harness window is a normal window holding a small
    same-origin **launcher tab** (`manage.html?launcher=1`, the same bundle). A badge click
    finds / creates that tab by name (no features — a popup could not hold tabs) and asks its
    hook `__birocodeOpenAgent(agentName, url)`, which opens the agent's named tab the first
    time and only focuses it after that; a brand-new launcher is awaited briefly while it
    loads. A popup-blocked launcher answers `blocked`: the click falls back to the tab beside
    the dashboard and the Settings tab shows what to allow. The Operator drags the launcher's
    window to the other monitor once and allows pop-ups for the site once; "Open the harness
    window now" creates the launcher tab to drag.
  - **single**: the earlier one viewer placed on a chosen screen (kept for those who prefer it;
    the only kind a page can place by script).
- The launcher page lists what it opened (name, hits, when) and says how to allow pop-ups.
- The Settings tab explains the two one-time steps and reports a blocked relay.

## Limitation, stated plainly

Per-agent tabs and script placement on a screen are mutually exclusive with web APIs: tabs
need a normal window (not placeable), placement needs a popup (cannot hold tabs). The tabs
viewer therefore relies on one drag; the extension route remains the only way to have both.

## Impact

Client: `harnessWindow.js` (viewer, `launcherUrl`, `isLauncherPage`, `installLauncher`,
`openAgentViaLauncher`), `workerWindow.js` (three ways at click time), `HarnessLauncher.jsx`
+ css, `main.jsx` (launcher route), `ManageSettings.jsx` (viewer choice, howto, relay note),
i18n en/tr; bundle rebuilt. Tests: `harnessWindow.launcher.test.mjs` (5), earlier placement
tests updated; `shot-harness-window-tabs.mjs` (8/8); the research script kept.
