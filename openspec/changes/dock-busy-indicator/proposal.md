## Why

The only at-a-glance signal that an agent dock is doing work is the 9px `phone__dot` in the
top-left of the dock header — a small green pulsing light that is very easy to miss when
scanning a wall of phones. The operator wants to see instantly, from across the dashboard,
which agents are actively processing and which are idle.

## What Changes

- Replace the tiny status dot in the top-left corner of each agent dock's header with a
  clearly visible work indicator that mirrors the chat composer's send button:
  - **Idle / ready** — accent orange (`--color-accent`, the send button's at-rest color).
  - **Working (sending / processing a turn)** — near-black (`--color-text`, the send
    button's Stop-state color), so "black = busy" reads the same in the dock header as in
    the chat composer.
- Make the indicator substantially larger / higher-contrast than the current 9px dot, so
  the busy state is legible at dashboard zoom-out distances.
- Preserve a distinct error signal: a dock in the `error` state keeps a red indicator
  rather than folding into the orange/black scheme.
- No backend or data-model change — the indicator renders from the same `status` prop the
  dock already receives.
- **Amendment (2026-08-07):** the dock toolbar — the horizontal strip in the dashboard
  header listing every dock, hidden ones included — mirrors the same signal on its per-tab
  dots: each dot keeps the dock's assigned color at rest and turns near-black
  (`--color-text`) while a prompt is running on that agent. Since the strip covers the full
  roster, the live-status poll extends to hidden docks (status only — no per-session
  transcript fetch for hidden docks), so the operator can see a hidden agent is busy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-dock`: ADDED requirement — the dock header SHALL show a prominent work indicator
  in its top-left corner whose colors mirror the chat send button (orange at rest, black
  while the agent is processing, red on error). The baseline spec has no requirement for
  the header status dot today, so this is an addition, not a modification of an existing
  requirement.
- `agent-dock`: ADDED requirement (amendment) — the dock toolbar strip's per-tab dots keep
  the dock's assigned color at rest and turn near-black while that agent is running,
  including for docks hidden from the grid.

## Impact

- `client/src/components/dashboard/PinnedAgent.jsx` — the `phone__dot` element in
  `phone__bar` (markup may grow a modifier class; possibly nothing more than CSS).
- `client/src/pages/dashboard.css` — `.phone__dot` sizing and the
  `.phone--running` / `.phone--done` / `.phone--error` color rules.
- Reuses existing design tokens (`--color-accent`, `--color-text`) from
  `client/src/styles/global.css`; no new tokens, i18n keys, endpoints, or dependencies.
- Note: the dock header is also being touched by the in-flight `add-dock-openspec-lane`
  change — coordinate merge order if both land near-simultaneously.
