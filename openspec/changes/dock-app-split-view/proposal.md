# Proposal: dock-app-split-view

## Why

Opening a local app in an agent dock currently swaps the app **over** the dock: the app
frame takes the dock's full surface and the chat collapses to a composer-only strip
underneath (the keep-composer behavior). That trades away exactly what the operator
wants when driving an app with the agent — seeing the conversation (and the rest of the
dock) **while** the app is on screen. We want a mode where the dock and the opened app
sit side by side: chat/dock as it is today on the left, the clicked app on the right.

## What Changes

- Add a **split (side-by-side) view mode** for a dock's opened local app: the dock's
  chrome (bar, lanes, app switcher, git/discover blocks) stays in place exactly as
  with no app open, and the screen area below splits — full chat (message list and
  composer) in a **left pane**, the opened app's frame in a **right pane**.
- Split is **a mode, not a replacement**: the current cover ("over the whole dock",
  composer-only) presentation remains, and the operator can switch between cover and
  split per dock. Split state is device-local and ephemeral like the dock's other view
  toggles (maximize-chat, files, console).
- A dock in split mode gets **wider in the dashboard grid** (building on the existing
  wide/`span 2` cell mechanism) so the left pane keeps a usable chat width instead of
  halving a normal phone cell.
- The app frame in the right pane keeps all existing frame behaviors: same
  `/api/localview/<repo>/app/<appId>/` proxy URL, per-frame zoom controls, and the
  keep-alive frame host (switching cover ↔ split must NOT reload the app or drop its
  state — same `frameKey`, repositioned, never re-parented).
- Closing the app (or switching to Files/Console views) leaves split mode cleanly and
  returns the dock to its normal single-pane rendering and normal grid width.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: new requirement — a per-dock side-by-side presentation mode for an
  opened local app (left pane = full dock/chat, right pane = app frame), switchable
  against the existing cover presentation, with the dock widening in the grid while
  split and app-frame state preserved across mode switches.

## Impact

- **Frontend only** — no backend/API changes.
  - `client/src/components/dashboard/PinnedAgent.jsx` — the dock: split-mode state,
    two-pane layout, mode toggle, chrome no longer hidden when the app is open in split.
  - `client/src/pages/Dashboard.jsx` + `client/src/pages/dashboard.css` — grid cell
    widening for split docks (extends the `.dash__cell--wide` / span mechanism).
  - `client/src/components/app/ProductFrame.jsx` / `LocalAppFrameHost.jsx` — no
    behavioral change expected; the right pane hosts the same slot + `frameKey` so the
    keep-alive host just tracks new geometry.
  - `client/src/context/UiModeContext.jsx` — split toggle is Advanced-mode
    (new-feature default) while plain app opening stays Basic (`localAppTab`).
  - i18n: new strings in `en.json` + `tr.json` for the toggle.
- **Interacts with** (must not regress): keep-composer chat mounting (chat subtree
  never remounts), per-frame zoom (`local-app-zoom`), keep-alive frames
  (`local-app-state-preserve`), dock grid layout (`dock-grid-layout`) and free layout
  (`dashboard-free-layout`), whole-dock content zoom.
