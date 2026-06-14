# Dashboard shortcut — keyboard toggle between dashboard and tabs

> **Status (2026-06-14):** DEPLOYED & CONFIRMED on live :5099 (77aa0ae); rollback
> disarmed. Browser-verified (verify-dashboard-shortcut.mjs 5/5). Frontend-only
> addition to the agent dashboard ([agent-dashboard.md](agent-dashboard.md)).
> Merged to main.

## Problem

The agent dashboard is a full-screen overlay toggled only by the header
**DashboardButton** (visible with ≥2 agents) or closed with Escape. There's no
keyboard way to *open* it / flip back — a power-user wants to toggle without
reaching for the button.

## Goal

A keyboard shortcut that **toggles** between the dashboard overlay and the
normal tab view.

## Design

- Generalize `StudioShell`'s existing Escape-only `keydown` effect into an
  always-on handler:
  - **`Ctrl/Cmd + Shift + D`** → `setDashOpen((o) => !o)`, with `preventDefault`
    so it wins over any browser binding.
  - **Escape** → close (unchanged).
  - **Ignored while typing** (target is `input`/`textarea`/`select` or
    `isContentEditable`) so it never fires mid-message.
- Gated on the `agentDashboard` feature (Advanced), like the button. Toggles
  regardless of agent count (predictable); the button keeps its ≥2 visibility.
- The header button gains a tooltip with the shortcut.

## Decisions

- Default combo `Ctrl/Cmd + Shift + D` (mnemonic, `preventDefault` overrides the
  browser). Trivially changed if the user prefers another.
- Toggle (not just open); Escape still closes.

## Implementation

- `Layout.jsx` (`StudioShell`): `useFeature('agentDashboard')`; replace the
  Escape effect with the toggle+Escape handler; add the button tooltip.
- i18n (en/tr): `dashboard.shortcutHint` for the tooltip.

## Verification

`verify-dashboard-shortcut.mjs` (advanced, ≥2 pinned dock tabs): press
`Control+Shift+D` → the `.dash` overlay appears; press again → it's gone (tab
view back); Escape closes; focus a text input, press the combo → no toggle. Read
a screenshot.
