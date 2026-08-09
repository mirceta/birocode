# Queue-based loop — design

## Context

The loop engine is deliberately shaped for this growth: every autopilot mode is an
`ILoop` kind (`ClaudeWeb.App/Services/Autopilot/ILoop.cs`), stateless singletons
deciding exactly one `LoopDecision` per tick, with all mechanics — idle detection,
dedup, cap check, drive/suggest mode dispatch, auditing, the operator gate — in
`AutopilotService` and all per-agent state on the one `LoopConfigStore` record per
repo (structural XOR arming). The driven kinds (📋 recipe, 🎯 goal) share the
`DrivenLoop` safety ladder (run errored → `NEEDS_HUMAN:` → deny-list) and the
final-line completion-token rule.

The other half already exists too: the per-tab **prompt stash**
(`DockRegistry.Stash`, plans/prompt-stash.md) — an ordered list of prompt ideas
jotted while the agent runs, shown above the composer, durable in dock.json and
shared across devices, with add/remove endpoints on `DockController` (no reorder
yet). It is precisely "the prompts the operator would send by hand anyway",
already lined up in order. The queue kind wires the two together instead of
duplicating the list.

Two operator-workflow facts drive the shape (and amended the first draft of this
change, which froze a copied snapshot at arm time): stash items accumulate
**while** the agent works, so the queue must stay live; and one-per-turn
unloading is blind to whether the previous prompt actually got solved — the
agent may have answered with a question or hit a blocker that the next item
would bury — so between-step verification is the default posture, not an add-on.

## Goals / Non-Goals

**Goals:**

- A 🗒️ `queue` kind: arm an agent's loop slot onto its tab's stash; unload the
  head item once per turn end; `done` when the stash drains — under all existing
  mechanics (ladder, cap, audit, gate, drive/suggest mode, pinned conversation).
- The stash stays the single source of truth: reorderable (new, works armed or
  not), live-editable while the queue runs, items consumed only when a send
  lands.
- Between-step verification ON by default: a non-`STEP_VERIFIED` verification
  reply stops-and-escalates instead of unloading the next item into an
  unresolved step.
- Lossless stop: unsent items remain in the stash, so escalate/disarm → converse
  → re-arm is the interleaving mechanism.
- Armed and disclosed from the dock's unified loop control **and** a new Queue
  tab in the autopilot console's Loops section; counts ungated, texts gated.
- Honesty pass on every surface that says the queue kind doesn't exist.

**Non-Goals:**

- No cross-agent or shared queues — one queue per agent, on the agent's one loop
  slot, bound to that agent's tab stash. The **global** (tab-independent) stash
  is untouched.
- No standing "stay armed when empty" mode — drained resolves `done`; re-arming
  is one tap. Revisit only on real demand.
- No pause primitive — disarm/re-arm IS pause, made cheap by lossless stop.
- No per-step sentinels from the driven agent: the queue advances on turn end
  (+ verification), not on `LOOP_DONE`. `STEP_VERIFIED` is asked for only in
  verification turns.
- No LLM judgment anywhere in the kind — deterministic string checks only, like
  recipe/goal.

## Decisions

**D1 — `QueueLoop : DrivenLoop`, kind constant `queue`.** The queue is a driven
kind: it inherits the shared ladder, so an errored run, a `NEEDS_HUMAN:` reply, or
a deny-listed word in the reply stops it BEFORE the next item is unloaded.
Alternative considered: a standalone `ILoop` — rejected, the ladder is exactly the
"don't send the next prompt into a broken state" behavior the card promises.

**D2 — The stash IS the queue; no snapshot, no cursor.** The loop record stores a
`QueueTabId` binding, not a step list: at each idle tick the kind reads the bound
tab's stash and proposes the **head** item. Consume-on-land: drive mode removes
the item from the stash when the send lands; suggest mode when the pend is
consumed (the suggestion kind's existing mechanism) — never at decide time, so a
held tick re-decides idempotently. Consequences that are the point: items added,
removed, or reordered while armed simply change what unloads next; unsent items
never leave the stash, so every stop is lossless and re-arm resumes from the
head with no cursor state at all. Honesty holds per-send: every byte ever sent
is a stash item the operator can already see above the composer, and the
last-sent text is kept on the record (D4) for the gated detail and escalation
quotes. Alternative — copy steps onto the record at arm time (the first draft):
rejected; freezing defeats the accumulate-while-busy workflow and duplicates a
list the UI already renders. If the bound tab disappears mid-arm, the loop
resolves `error` ("stash tab gone").

**D3 — Drain semantics.** Tick with the agent idle: if a verification is owed
(D4), that goes first. Otherwise, stash empty → `Stop("done", "drained",
"queue: N prompts completed")` (N = sends this arm). Otherwise propose the head
item's text with the consume-on-land marker. Mode dispatch is the engine's,
untouched: drive sends (capped, audited), suggest pends into the composer.
`LOOP_DONE` in a step reply is ignored (a queue is the operator's ritual, not
the agent's claim); `NEEDS_HUMAN:`/deny-list still stop via the ladder.

**D4 — Verification between steps, ON by default, composed at send time.** This
is the answer to "we don't know what happened with the previous item": the
driven agent is an ordinary chat agent that may reply with a question or a
blocker without knowing any sentinel, and blind unloading would bury it. With
`VerifyEnabled` (default **true**; opt-out at arm for fire-and-forget queues),
after an unloaded step's turn ends the loop proposes a verification prompt
(entering a `verify` phase via the existing `Phase` field) composed from the
stored `QueueVerifyTemplate` (`{0}` = that step's text): review whether that
request was genuinely accomplished; if yes, final line **`STEP_VERIFIED`**;
if not, state the open question or blocker plainly. A verified reply unloads
the next item; any other verification reply →
`Stop("escalate", "step-unverified", …)` quoting a snippet — the queue never
sends the next item into an unresolved step. Compose-at-send is a deliberate,
honest relaxation of the driven kinds' compose-at-arm rule (a live queue has no
arm-time step list): the template is stored verbatim and gated-inspectable, and
the other component is the visible stash item — the composition is
deterministic from two operator-visible texts. The step's text is stamped on
the record (`LastStepText` + phase) when it lands, so a restart mid-step still
verifies the right thing (durable like everything on loops.json). A new token
(not `GOAL_VERIFIED`) so a queue driving goal-contract agents can't
cross-trigger. Alternative — verify-retry-loop like the goal kind: rejected;
the card promises stop-and-escalate, and a ritual step that didn't take needs
the human, not a blind retry.

**D5 — Interleaving = stop, converse, re-arm.** The operator's "answer the
agent's question in between" case needs no new primitive: verification (or the
ladder) stops the queue at exactly that point, the remaining items are still in
the stash (D2), the operator chats with the agent normally, then re-arms —
continuing from the head. Suggest mode remains the fully human-gated variant
(every unload is a pend the human sends). A drive-mode "pause" button is
deliberately not built: it would race the engine's tick and duplicates
disarm/re-arm.

**D6 — Cap.** A live queue has no arm-time length, so the default cap is the
driven kinds' standard arm default, operator-overridable, clamped 1..100 as
everywhere; verification roughly doubles sends per item (the arm UI hint says
so). `IterationsDone` keeps counting SENDS (verification turns included), so
the cap stays a true bound on sends; a queue that hits it resolves `capped`
exactly like the other kinds.

**D7 — Surfaces.** (a) **Stash strip reorder** — the strip above the composer
gains reordering (up/down affordance or drag; implementation-time call), armed
or not; new `POST /api/dock/{id}/stash/reorder` taking the full ordered id
list, applied under the registry lock, ids consumed meanwhile by the engine
simply ignored (last-write-wins). (b) **Dock loop control** — the type picker
gains 🗒️ Queue: settings only (mode, cap, verify toggle), a "next up" preview
and remaining count; the stash strip is the editor, no duplicate list. (c)
**Autopilot console, Loops → Queue tab** — the settings home: per-agent queue
status (remaining / sent / phase), the same settings, arm/disarm. The ungated
projection gains `queueRemaining` / `queueSent` and the phase (counts only,
like looping n/cap); item texts, `LastStepText`, and the verify template follow
the existing gated-detail disclosure rule.

**D8 — API shape follows the existing arms.** A queue arm endpoint beside the
recipe/goal arms (`AutopilotController`), taking `{ tabId, mode, verifyEnabled?,
maxIterations?, sessionId? }` — arming requires the bound stash to be non-empty
(guards accidental no-op arms); `LoopConfigStore.StartQueue(...)` mirrors
`StartGoal` (reset counters, stamp `ArmedAt`, pin session). Legacy `loops.json`
entries are untouched — `QueueTabId` / `VerifyEnabled` / `LastStepText` /
`QueueSent` are additive nullable fields, normalized on read like every prior
migration.

## Risks / Trade-offs

- [Reorder racing the engine's consume] → both mutate under the `DockRegistry`
  lock; the engine takes the head at land time, reorder ignores ids no longer
  present. E2E covers reorder-while-armed.
- [Suggest-mode consume depends on pend-consumed detection] → reuse the
  suggestion kind's existing mechanism verbatim; e2e covers a suggest-mode queue
  consuming only after the human sends.
- [A stash item containing `NEEDS_HUMAN:` or a deny word in the AGENT's echo
  stops the queue] → same false-positive direction as recipe/goal (safe side:
  stop and ask); documented, not special-cased.
- [Verification template wording unproven] → same posture as the goal templates:
  draft constant in `LoopConfigStore`, tune from real runs. Default-on means a
  chatty agent costs 2× sends — the opt-out and the cap both bound it.
- [Compose-at-send weakens byte-identical arm-time inspection] → accepted
  deliberately (D4); the template is stored + inspectable and the step text is
  operator-visible in the stash; the audit trail still records every actual
  send verbatim.
- [Restart mid-queue] → stash (dock.json) and loop record incl. `LastStepText`
  + phase (loops.json) are durable; the engine resumes where it left off, same
  as every kind.
- [Tab deleted while armed] → loop resolves `error` rather than silently going
  inert; covered in e2e.

## Open Questions

- None blocking. Template wording (D4) and the exact reorder affordance
  (drag vs up/down) are implementation-time calls.
