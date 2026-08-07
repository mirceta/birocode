## Why

In the dock's loop section, the per-arm **deny-list** editor (the droppable term chips)
appears only when arming a **queue** loop. Arming a **goal** loop shows no deny-list at
all — which reads as "goal loops don't apply the deny-list." That impression is wrong:
the engine's reply-judging path applies `loop.DenyList ?? global default` to **every**
driven loop kind (`ILoop` deny check), so a goal loop silently enforces the global terms
the whole time. The UI asymmetry misleads the operator about live safety behavior and
withholds the per-arm trim that queue arms already have.

## What Changes

- **Hoist the per-arm deny-list chips out of the queue-only section** into a shared spot
  at the **top of the expanded Loops section**, shown whenever the section is open —
  because the deny-list applies to every driven loop kind and the dock has one loop slot.
  The chips keep their semantics: global default terms, droppable for this arm,
  untouched = follow the global default.
- The trimmed list rides on **every driven arm request** — queue (as today), **goal**, and
  **recipe** — via the existing `LoopRequest.DenyList` field, and persists on the instance.
- While a loop is armed, the same shared spot shows the armed instance's **effective**
  deny-list (gated, as today's queue display is).
- Backend: thread `DenyList` through `StartGoal` and `StartRecipe` (today only
  `StartQueue` accepts it) — parameter additions only; no new endpoint, no engine change
  (the engine already honors a per-instance list for every kind).
- Suggestion-mode arms are untouched (they don't drive sends; the classifier keeps using
  the global default).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `autopilot-loops`: the per-arm deny-list adjustability requirement extends from queue
  arms to **all driven arms** (goal and recipe included), presented **once,
  kind-independently** at the top of the dock's loop controls rather than inside one
  kind's section — same trim semantics, same gated disclosure of the effective list.

## Impact

- **Frontend:** `client/src/components/dashboard/DockLoopControl.jsx` — move the existing
  deny-chip block (today inside the queue-only section) to a single shared render site at
  the top of the expanded loop section; include `denyList` in the queue, goal, and recipe
  `act('/autopilot/loop', …)` payloads when terms were dropped. The chip state/hydration
  logic is already kind-agnostic and lifted to the control's top level.
- **Backend:** `ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs` — `StartGoal` and
  `StartRecipe` gain a `denyList` parameter (mirroring `StartQueue`);
  `AutopilotController.cs` passes `req.DenyList` at those call sites. Engine untouched —
  `AutopilotService` already reads `loop.DenyList ?? cfg.DenyList` for all kinds.
- **No migration:** existing armed loops have `DenyList = null` (or their queue trim) and
  keep behaving byte-for-byte as today.
