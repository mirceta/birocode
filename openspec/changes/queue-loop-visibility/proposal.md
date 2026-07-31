# queue-loop-visibility

## Why

The queue loop works, but its consumption is invisible: an in-flight stash item
sits unmarked in the strip through its whole work + verify cycle, nothing
distinguishes "next up" from "just stashed", the arm popover previews only the
head item, and once an item lands it vanishes without a trace. The operator
watching the strip cannot tell whether prompts were unloaded or not. The first
instinct ("import the prompts into a frozen queue at arm time") was already
considered and rejected as D2 of `queue-based-loop` — the live stash IS the
queue, which buys mid-run stashing, reordering, and lossless stops. This change
keeps D2 and fixes the visibility instead.

## What Changes

- **Arm-time preview**: the dock loop control's queue section shows the FULL
  ordered stash list (numbered, top = first to unload), not just the head item
  and a count. The console's Queue arm form gets the same list.
- **Armed strip marking**: while a queue loop is armed on a tab, that tab's
  stash strip renders as the live queue — items numbered in unload order, the
  head badged as "next up" (loop idle) or "in flight" (work/verify phase in
  progress), with a queue-armed accent on the strip. Unarmed tabs and the
  global stash render exactly as today.
- **Sent history**: the loop record keeps a bounded list of the queue's
  actually-sent step texts (append on land, newest last). Disclosed only via
  the gated detail — rendered in the dock popover's inspection pane and the
  console's Queue tab as "sent ✓" rows — so the operator can see *which*
  prompts already unloaded, not just a count. Ungated projection keeps
  counts/phase only, unchanged.
- No behavioral change to consumption, verification, stopping, or re-arm.
  Explicitly **no snapshot/import** — D2 stands.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `autopilot-loops`: queue consumption becomes observable — full-order arm
  preview on the arming surfaces, and a gated sent-history of unloaded step
  texts on the loop record and its disclosure surfaces. (Added as new
  requirements; the queue kind's existing requirements are untouched.)
- `prompt-stash`: the stash strip discloses its queue binding — while a queue
  loop is armed on the tab, the strip marks unload order and the head item's
  next-up/in-flight state.

## Impact

- Backend: `LoopConfigStore` (bounded `QueueSentTexts` on the record, appended
  where `QueueSent` increments on land), `AutopilotController` gated detail
  projection. No new endpoints; ungated projection unchanged.
- Frontend: `DockLoopControl.jsx` (full-list preview + sent history in
  inspection), `LoopsView.jsx` Queue tab (same two), `ChatInput.jsx` stash
  strip (queue-armed marking, fed by the loop projection the dashboard already
  polls), `chat.css` / `autopilot.css`, i18n keys (en/tr).
- Docs: understanding-app honesty pass; `plans/prompt-stash.md` untouched
  (frozen); convention docs unaffected (no contract change for the driven
  agent).
