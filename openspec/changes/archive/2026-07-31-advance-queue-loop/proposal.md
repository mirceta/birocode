# Advance the queue-based loop

## Why

The queue loop shipped and works in the lab, but its first real drive — today's
busi-dec expense checklist, 8 stashed prompts — failed on iteration 1 **twice**
and the operator finished the job by hand. The failures are not exotic; they are
what any real repo will hit:

1. **Wrong-target arm.** The first arm bound the queue to the harness's own tab
   (mid self-dev deploy) instead of busi-dec, and the head item fired straight
   into the harness agent's ongoing conversation — nothing at arm time made the
   binding conspicuous enough to catch. The operator's rescue Stop was then
   recorded as `error · the agent's run errored` — a user action misreported as
   an agent failure.
2. **Deny-list false positive kills honest repos.** The correct re-arm ran its
   step perfectly (commit landed), but the reply honestly reported "pushed" —
   busi-dec's convention is commit-and-push every change — and the whole-reply
   substring match on the default deny term `push` escalated the queue before
   verification ever ran. A repo whose convention is to push is **structurally
   unable to get past item 1**.
3. **A stopped queue is a dead end.** After the escalate, 7 items sat stranded in
   the stash with the loop record frozen at `escalate / verify-owed`. Losslessness
   held (nothing was lost) but recovery is all manual: no one-step resume, and a
   dead instance's stale phase invites a wrong first decision on re-arm.

## What Changes

- **Arming is an explicit, named handoff.** The arm surfaces (dock control,
  console form) state the binding loudly — repo name + tab + item count — and
  that the head item fires as soon as this agent is next free; the armed
  status keeps naming the binding on every disclosure surface. (The engine
  already never sends mid-run; the gap was that nothing made a wrong-tab arm
  visible before the first send.)
- **Truthful stop attribution.** An operator Stop during a queue-driven turn
  resolves the loop as **stopped · by-operator** (a neutral outcome, remainder
  kept), never as an agent error. `error` is reserved for genuine run failures.
- **Deny-list that fits driven repos.** The reply deny-list check becomes
  whole-word (matching the spec's existing rule for routine names), and the arm
  settings expose the effective deny-list per arm: the operator can trim or
  disable terms for that arm (e.g. drop `push`/`merge` for a commit-and-push
  content repo) with the default list untouched elsewhere. The escalate detail
  keeps naming the matched term and quoting the hit.
- **One-step resume.** A stopped queue loop (escalated, errored, capped, or
  operator-stopped) with items remaining offers **Resume** on its disclosure
  surfaces: re-arms the same tab with the same settings, phase reset clean, next
  decide unloading the current head. Re-arm through any path clears stale phase
  state (`verify-owed` from a dead instance never leaks into a fresh arm).
- **Existing mechanics unchanged:** live-stash-as-queue (D2 stands), head-first
  consume-on-land, `STEP_VERIFIED` between-step verification, the safety ladder,
  iteration cap, audit trail, operator gate, and ungated count-only disclosure.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `autopilot-loops`: arm-time binding disclosure + idle-wait before the first
  unload; queue sends never land into an in-progress run; operator-stop as its
  own stop reason distinct from `error`; whole-word reply deny-list matching
  with per-arm trim/disable; Resume action on stopped queue loops with
  remainder; phase reset on every (re-)arm. (The queue kind's base requirements
  live in the completed-but-unarchived `queue-based-loop` /
  `queue-loop-visibility` deltas — this change layers on top of them and does
  not restate them.)

## Impact

- **Backend** (`ClaudeWeb.App/Services/Autopilot/`): `AutopilotService` (idle
  gate before unload, operator-stop attribution, resume path), `ILoop.cs`
  (whole-word deny matching, per-instance deny-list), `LoopConfigStore`
  (per-arm deny-list fields, phase reset on arm, `by-operator` stop reason),
  `AutopilotController` (resume endpoint, arm payload additions);
  `Services/Chat` stop path must distinguish operator stop from run error where
  the loop observes it.
- **Frontend** (`client/src/`): `DockLoopControl.jsx` (binding line, pending
  state, deny-list editor, Resume), `LoopsView.jsx` Queue tab (same), i18n
  en/tr, dashboard/autopilot css.
- **Docs**: `docs/loop-driven-agent-convention.md` "what stops a loop" order
  gains operator-stop; deny-list note updated to whole-word. Understanding app
  honesty pass.
