## Why

In the dock's loop section, the per-arm **deny-list** editor (the droppable term chips)
appears only when arming a **queue** loop. Arming a **goal** loop shows no deny-list at
all — which reads as "goal loops don't apply the deny-list." That impression is wrong:
the engine's reply-judging path applies `loop.DenyList ?? global default` to **every**
driven loop kind (`ILoop` deny check), so a goal loop silently enforces the global terms
the whole time. The UI asymmetry misleads the operator about live safety behavior and
withholds the per-arm trim that queue arms already have.

## What Changes

- Show the same per-arm deny-list chips in the **goal** arm section of the dock loop
  control that the queue arm already has: the global default terms, droppable per-arm
  before arming, restoring the same "untouched = follow the global default" semantics.
- Send the trimmed list on the goal arm request (the shared `LoopRequest.DenyList` field
  already exists) and persist it on the goal instance, exactly as queue arms do.
- Show the armed goal instance's **effective** deny-list in the gated loop detail, as the
  queue instance already does (the projection already emits `loop.denyList` for any kind).
- Backend: thread the request's `DenyList` through `StartGoal` (today only `StartQueue`
  accepts it) — a parameter addition, no new endpoint and no engine change (the engine
  already honors a per-instance list for every kind).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `autopilot-loops`: the per-arm deny-list adjustability requirement extends from queue
  arms to goal arms — same trim semantics, same gated disclosure of the effective list.

## Impact

- **Frontend:** `client/src/components/dashboard/DockLoopControl.jsx` — render the
  existing deny-chip block (today inside the queue-only section) in the goal arm section
  too, and include `denyList` in the goal `act('/autopilot/loop', …)` payload when terms
  were dropped; the chip state/hydration logic is already kind-agnostic.
- **Backend:** `ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs` — `StartGoal` gains a
  `denyList` parameter (mirroring `StartQueue`); `AutopilotController.cs` passes
  `req.DenyList` at the goal start call site. Engine untouched — `AutopilotService` already
  reads `loop.DenyList ?? cfg.DenyList` for all kinds.
- **Out of scope (deliberate):** the **recipe** arm has the same asymmetry; left out to
  keep this change minimal per the user's ask. If wanted, it is the same three edits again.
- **No migration:** existing armed goal loops have `DenyList = null` and keep following the
  global default, byte-for-byte today's behavior.
