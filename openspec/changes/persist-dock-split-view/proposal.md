# persist-dock-split-view

## Why

Hiding an agent dock via the dock toolbar strip unmounts it (by design — a hidden
dock does no work), but that also wipes the dock's local-app view state, which lives
as component state in `PinnedAgent.jsx`: which local app was open (`openAppId`),
whether split presentation was on (`splitApp`), and the divider ratio (`splitRatio`).
Re-showing the dock therefore always lands on plain chat, and the operator must
redo three steps — reopen the app, re-enter split, re-drag the divider — every time
they hide and re-show a dock. The app frame itself already survives the hide (frame
keep-alive, `local-app-frame-persistence`), so today we keep the expensive state and
lose the cheap pointer to it.

## What Changes

- When a dock is re-shown after being hidden (dock toolbar strip, "show only
  important" filter, or any other unmount that keeps the dock on the roster), it
  restores its local-app view exactly as it was: the same app open, in the same
  presentation (cover or split), with the same divider ratio.
- The per-dock view state (`openAppId`, split on/off, split ratio) becomes
  device-local **persistent** state (survives unmount; per this device, like the
  dock-hidden set itself) instead of ephemeral component state.
- Rehydration is guarded: if the remembered app no longer exists in the repo's
  app list (or the repo changed), the dock falls back to plain chat and the stale
  memory is dropped. Split-without-app is never restored.
- The Advanced gate keeps working: in Basic mode the split affordance is still
  absent; a remembered split state simply degrades to cover/chat per the existing
  gate rules.
- No behavior change while a dock stays mounted; no cross-device sync; no backend
  state.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: the "Side-by-side view mode for an opened local app" requirement
  currently mandates the mode be *ephemeral* ("MAY reset on reload", scenario
  "Split mode is per-dock and ephemeral"), and the "Adjustable split ratio via a
  draggable divider" requirement mandates the ratio be *session-ephemeral*
  (scenario "Ratio persists per dock while mounted"). Both are upgraded: the
  opened app, the split mode, and the ratio SHALL survive the dock being hidden
  and re-shown on the same device, with a guarded fallback when the remembered
  app is gone. Per-dock and device-local remain unchanged.

## Impact

- **Frontend only**: `client/src/components/dashboard/PinnedAgent.jsx` (storage
  helpers + lift `openAppId` / `splitApp` / `splitRatio` into persisted per-dock
  storage + rehydrate on mount, guarded against a vanished app), plus one line in
  `Dashboard.jsx`: the `localApps` prop is passed without the `|| []` fallback so
  `undefined` = "repos not loaded yet" — the loaded-signal the vanished-app guard
  needs (an empty array before load must not read as "this repo has no apps").
- **Interacts with** (no changes needed): `local-app-frame-persistence` — the
  kept-alive frame is what makes restore instant; the dock-hidden toggle path
  itself; UI-mode gate `dockAppSplit` in `UiModeContext.jsx`.
- **No backend, no API, no i18n changes** (no new visible affordances — the
  existing buttons just come back pre-set).
- **Tests**: a Playwright verify script (hide dock → re-show → app + split +
  ratio restored; and the vanished-app fallback).
