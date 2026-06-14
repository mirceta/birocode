# Understanding — keyboard shortcut to toggle the agent dashboard

## Goal
A keyboard shortcut that flips between the **agent dashboard** (full-screen
overlay) and the normal **tab view**, so you don't have to reach for the header
button. This is a web-app `keydown` handler in the Claude Web UI (not a Claude
Code CLI keybinding).

## How
- The dashboard is `dashOpen` state in `Layout.jsx`'s `StudioShell`. There's
  already an Escape-to-close handler; I'll generalize it to an always-on handler
  that **toggles** `dashOpen` on the shortcut and still closes on Escape.
- **Default key: `Ctrl/Cmd + Shift + D`** (mnemonic). We `preventDefault` so it
  overrides any browser binding. Ignored while typing in an input/textarea/
  contenteditable. Advanced-mode only (`agentDashboard` feature), matching the
  button.
- The header button gets a tooltip showing the shortcut.

## Notes / judgment calls
- Toggles regardless of agent count (predictable); the dashboard renders
  whatever agents exist. (The button itself only appears with ≥2 agents.)
- `Layout.jsx` is the parallel session's active agent-dashboard file — small
  additive change; I'll fetch + compose at deploy/merge.
- Key is easy to change — tell me if you'd prefer a different combo.

## Plan
`plans/dashboard-shortcut.md`, branch `feature/dashboard-shortcut`. Frontend-only
(`Layout.jsx` + a tooltip i18n string). Verify: the combo opens the `.dash`
overlay and toggles it back; Escape closes; typing in a field doesn't trigger it.
