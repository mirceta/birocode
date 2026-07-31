# advance-queue-loop — design

## Context

The queue kind (openspec: `queue-based-loop`, visibility via
`queue-loop-visibility`) drives the bound dock tab's live stash head-first with
`STEP_VERIFIED` gating between steps. Its first real drive (busi-dec,
2026-07-31, 8 items) died on iteration 1 twice; the post-mortem evidence lives
in the harness log (`[LOOP]` lines 16:41–16:45), `loops.json`, and
`autopilot-audit.jsonl`:

- Arm #1 bound the wrong tab (the harness's own) and the head item fired into
  that agent's conversation; the operator's Stop finalized the run as `error`
  (`RunSessionService` has only `running | done | error` — a cancelled run
  falls into `error`, `RunSessionService.cs:127-135`), which `DrivenLoop`'s
  ladder reported as `error · the agent's run errored`.
- Arm #2 (correct tab) completed its step and committed, but the reply's honest
  "pushed" report hit the default deny term `push` via the whole-reply
  substring match (`ILoop.cs:107-110`), escalating before the verification
  turn. busi-dec's convention is commit-and-push every content change, so this
  repo can never pass item 1.
- The dead instance froze at `escalate / verify-owed` with 7 items stashed;
  the only recovery is manually re-arming through the full arm form.

Constraints: all stop detection stays deterministic (no LLM judging); the
operator gate fences every action; ungated disclosure stays count-only; D2 of
`queue-based-loop` (live stash IS the queue) stands.

## Goals / Non-Goals

**Goals:**

- An operator Stop is never reported as an agent failure, and never poisons
  the loop record.
- A repo whose convention mentions deny terms in honest reports can be queue-
  driven without weakening the global default fence.
- A stopped queue with remainder resumes in one gated action, with no stale
  phase leakage.
- The binding (which repo/tab a queue will drive) is unmistakable at arm time
  and on every armed surface.

**Non-Goals:**

- No snapshot/import of the stash (D2 stands), no pause primitive, no change
  to `STEP_VERIFIED` semantics, templates, or the iteration cap.
- No automatic detection that stash items "belong" to a different repo —
  that's semantic guessing; we make the binding conspicuous instead.
- No change to the suggestion kind or its classifier gate.

## Decisions

### D1 — Operator stop becomes a first-class run outcome, and a loop stop reason

`RunSessionService` grows a `StopRequested` flag set by the existing Stop
endpoint path before `Cts.Cancel()`; finalization becomes
`_sawDone ? "done" : (StopRequested ? "stopped" : "error")`. `LoopContext`
gains `RunStopped`; `DrivenLoop.Decide` checks it **before** `RunErrored` and
returns `Stop("stopped", "by-operator", "the operator stopped the agent's
run")`. `Status = "stopped"` already exists in the `LoopState` vocabulary.
Remainder is naturally kept (unsent items never left the stash).

*Alternative considered:* mapping cancellation inside the loop engine by
remembering "we saw a stop request recently" — rejected: the run layer knows
the truth cheaply and other consumers (chat UI, event feed) benefit from the
honest third status.

### D2 — Deny matching becomes whole-word; the effective list is per-arm

Two independent levers, both taken:

1. **Whole-word matching.** `DrivenLoop`'s reply check matches each term at
   word boundaries (case-insensitive; a term is a hit only when not embedded
   in a larger alphanumeric run — so `push` no longer matches `pushed`,
   `prod` no longer matches `product`; multi-term strings like
   `reset --hard` keep working since boundaries are checked at the term's
   alphanumeric edges). This mirrors the baseline requirement that already
   demands whole-word deny matching for routine names — the reply check
   becomes consistent with it.
2. **Per-arm effective list.** The arm payload (dock + console, queue kind
   first but stored generically for driven kinds) may carry a trimmed
   deny-list; `LoopState` stores it (`DenyList: List<string>?`, null = use
   global default). The engine passes the instance's effective list into
   `LoopContext`. The arm form shows the default list as removable chips —
   dropping `push`/`merge` for a commit-and-push repo is a per-arm, per-
   instance decision recorded on the loop record (inspectable via the gated
   detail, auditable). The global default in `autopilot.json` is untouched.

*Alternative considered:* a per-repo deny-list config — rejected for now: the
risk profile belongs to the *arm* ("this queue is content-only work"), not
permanently to the repo; per-arm keeps the default fence in force for the next
arm unless deliberately trimmed again.

### D3 — Resume is a gated action on a stopped queue instance

`POST /api/autopilot/loop/resume` (operator-gated, same fencing as arm):
valid when the repo's instance is `Kind == queue`, `Active == false`, the
bound tab still exists, and its stash is non-empty. It re-activates the SAME
instance: `Active = true`, `Status = "looping"`, fresh `ArmedAt` (which
already clears the engine's per-repo dedup guards via `_armGen`), phase
cleared (D4), stop reason/detail cleared, `MaxIterations` window restarted
(`IterationsDone = 0` — resume means "drive the remainder", and the cap is a
per-drive safety budget, not a lifetime one). `QueueSent`/`QueueSentTexts`
are kept cumulative so the sent-history still tells the whole story. Audit
logs `resume` with the remaining count. Surfaced as a **Resume** button on
the dock popover and the console Queue tab wherever a stopped-with-remainder
queue instance is rendered.

*Alternative considered:* resume-as-sugar-for-re-arm (new instance copying
fields) — rejected: it would wipe the sent-history and double bookkeeping;
re-activating the record matches "continue from the head" semantics exactly.

### D4 — Phase is reset on every activation path

Arming and resuming both explicitly write `Phase = null` and
`LastStepText = null`. Rationale: phase is meaningful only within an active
drive; a dead instance's `verify-owed` must never make a fresh activation owe
a verification for a step that belongs to the previous drive. (The verify owed
for a step whose stop interrupted it is deliberately dropped — the operator
saw the stop, read the reply, and chose to resume; re-verifying a stale step
against a fresh conversation is the `fix-loop-verify-stale-reply` bug class
all over again.)

### D5 — The binding is disclosed, not guessed

Arm surfaces (dock loop control queue section, console Queue arm form) render
a binding line — "drives **<repo name>** · tab <tab label> · N queued" — plus
the note that the head item fires as soon as the agent is next free. Armed
disclosures (popover status, console row) repeat the binding line. Pure
frontend + existing projections (repo name is already on the loop row; the
tab label comes from the dock registry the client already holds). No backend
change beyond, if needed, echoing `QueueTabId` in the gated detail (it is
already stored on the instance).

## Risks / Trade-offs

- [Whole-word matching is a loosening — "pushing to prod" inside a longer
  token no longer trips] → the false-negative direction is bounded: terms
  still match as words anywhere in the reply, the default list is unchanged,
  and the per-arm trim is explicit and audited. The fence's purpose (catch an
  agent *about to* do something risky) never rested on substring hits inside
  unrelated words.
- [Per-arm trimming lets an operator disarm the fence entirely for an arm] →
  it is operator-gated, recorded on the instance, and shown in the gated
  detail; the suggestion classifier and `NEEDS_HUMAN:` ladder are unaffected.
- [`"stopped"` as a new run status may surprise consumers switching on
  `done|error`] → audit all `run.Status` readers in the sweep (chat UI, event
  feed, loop engine, dock projections) in the same change; the string set is
  small and greppable.
- [Resume on a stash the operator has meanwhile edited] → by design: the
  stash is live (D2 of `queue-based-loop`); resume drives whatever the head
  is now.
- [Resetting `IterationsDone` on resume weakens the cap as a lifetime bound]
  → intended: the cap bounds unattended drive length; each resume is a fresh
  operator decision. Audit still records every send.

## Migration Plan

Additive `loops.json` fields (`DenyList`), an additional `Status` string on
runs, one new gated endpoint. No data migration; existing instances keep
working (null `DenyList` → global default). Deploy via `swap.ps1` as usual;
rollback via the dead-man switch restores the previous build with no schema
damage (new fields are ignored by the old build).

## Open Questions

*(none — decisions above are complete enough to implement)*
