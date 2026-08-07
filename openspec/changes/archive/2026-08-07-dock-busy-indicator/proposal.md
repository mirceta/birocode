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
- **Unseen-result amendment (2026-08-07):** when a run finishes (`done`/`error`) while its
  dock is HIDDEN from the grid, the toolbar dot does not fall back to the assigned color —
  it becomes an **exclamation point** that persists until the dock is shown again, at which
  point it clears back to the assigned color. Without this, a hidden dock's finish reads as
  "idle" and the fact that the operator was waiting on that agent is silently lost. The
  latch is an acknowledgement flag about the *operator* ("you haven't looked yet"), not an
  agent status: running outranks it visually, and it can never appear on a grid-visible
  dock (showing is what clears it). It is **server-persisted** on the dock tab
  (`unseenResult`): set at the `RunCompleted` choke point (builder lane, `done`/`error` —
  `stopped` excluded as a deliberate operator action), cleared whenever a PATCH turns
  `dashboard` on (strip tab and Agents-page ▦ both route through it). Server-side
  persistence is the point: the finish is latched even when no browser has the dashboard
  open at completion time, and it survives reloads.

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
- `agent-dock`: ADDED requirement (unseen-result amendment) — a run finishing while its
  dock is hidden latches a server-persisted unseen-result flag; the toolbar dot renders it
  as an exclamation point until the dock is shown again.

## Impact

- `client/src/components/dashboard/PinnedAgent.jsx` — the `phone__dot` element in
  `phone__bar` (markup may grow a modifier class; possibly nothing more than CSS).
- `client/src/pages/dashboard.css` — `.phone__dot` sizing and the
  `.phone--running` / `.phone--done` / `.phone--error` color rules.
- Reuses existing design tokens (`--color-accent`, `--color-text`) from
  `client/src/styles/global.css`; no new tokens, i18n keys, endpoints, or dependencies.
- Note: the dock header is also being touched by the in-flight `add-dock-openspec-lane`
  change — coordinate merge order if both land near-simultaneously.
- Unseen-result amendment: `ClaudeWeb.App/Services/Dock/DockRegistry.cs` (new
  `UnseenResult` field + `MarkUnseenForRepo` + clear-on-show in `Update`), new
  `ClaudeWeb.App/Services/Dock/DockUnseenResultTrigger.cs` (hosted service on
  `RunSessionService.RunCompleted`, same pattern as `AutoUnderstandingTrigger`),
  `DockModuleExtensions.cs` (registration), `DockController.cs` (DTO),
  `client/src/components/dashboard/DockToolbar.jsx`, `client/src/pages/dashboard.css`,
  one new i18n key (`dashboard.dockToolbarUnseen`, en + tr). The first backend/data-model
  touch of this change — "No backend change" above no longer holds for this amendment.
