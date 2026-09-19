# Management dashboard: a Settings tab — where the Kanban badge links open, and the Fleet / Managed-agents settings moved out of Status

## Why

Two things in the Management App were in the wrong place or missing:

1. **Where a badge click lands.** Clicking a repo-agent badge on a Kanban card opens that
   machine's harness. The Operator runs two monitors and two Chrome windows — the dashboard
   on the right, the fleet harnesses on the left — and every new agent tab opens next to the
   dashboard, so it has to be dragged left every time. The mechanism (`workerWindow.js`) is
   `window.open('', perAgentName)` with no features: a named tab always lands in the
   opener's window. A page cannot enumerate Chrome's windows nor push a tab into one it did
   not open; it CAN open one named window with position + size features and, on a secure
   page with the Operator's one-time permission, place it on a chosen screen (the Window
   Management API). That is the setting.
2. **Configuration living on the Status tab.** The Arch's Managed-agents scope and Fleet
   posture (allow sends / accept sends / accept upgrades / upgrade a peer) are settings, not
   status; they sat on the Status tab beside Fleet Status.

## What changes

- **A Settings tab** (`settings`, after Status; URL `?tab=settings`; a pane like the others).
- **"Where the Kanban badge links open"** — device-local (`manageapp.harnessWindow`), two
  modes:
  - `tabs` (default, unchanged): one named tab per agent in this window, focused wherever the
    Operator dragged it;
  - `window`: ONE dedicated harness window (`birocode-harness-window`) created with the chosen
    screen's work-area features, navigated to the clicked agent and focused on every click.
    A screen picker (Detect screens → `getScreenDetails()`) when the page is a secure
    context with the API; otherwise an honest note (the window opens on this screen; drag it
    once, it stays) and "Open the harness window now" to park it. A "what a page can and
    cannot do" note names the extension route (`chrome.windows` / `chrome.tabs`) for tabs in
    an existing left-monitor window.
- **Managed agents + Fleet move to Settings**; Status keeps Fleet Status, the Home repo and
  the goal conversations. Same components (`Arch view="cards"` gains `cards="settings" |
  "status" | "all"`), identical behaviour.

## Limitation, stated plainly

With web APIs alone, tabs cannot be placed into an existing Chrome window. `window` mode
gives one viewer window (popup-style, no tab strip) that stays on the chosen monitor; placing
it there automatically needs https/localhost + the permission, else one drag. If the Operator
wants per-agent TABS inside the left-monitor window, that is a small companion extension the
dashboard would talk to — a decision for the Operator, listed as a follow-up.

## Composition

- `feature/fleet-by-account` (By plan / accounts subtab) is on main; Fleet Status is untouched.
- `kanban-agent-tabs` / `kanban-worker-window`: `focusAgentTab` keeps its behaviour in `tabs`
  mode and consults the placement first.

## Impact

Client: `components/shared/harnessWindow.js` (placement, features, screen picking, open), 
`workerWindow.js` (consults it), `manage/ManageSettings.jsx` + css, `manage/ManageApp.jsx`
(tab, weights, panes), `pages/Arch.jsx` (cards split), i18n en/tr; the Management App bundle
rebuilt. Tests: `harnessWindow.test.mjs` (6), `client/tests/ui/shot-manage-settings.mjs`
(10/10). Specs: `management-dashboard`, `task-graph`.
