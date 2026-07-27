# Design — adopt-autopilot-loops

## Context

All the machinery this change builds on exists and is verified:

- **Loop engine** — `AutopilotService.HandleLoop` (`ClaudeWeb.App/Services/Autopilot/AutopilotService.cs`):
  per-tick deterministic decision (error → sentinel → deny-list → cap → resend),
  double-send guard, audited resends (`outcome = "loop"`).
- **Loop store** — `LoopConfigStore` (`loops.json`, atomic writes): one loop per
  repo, durable fields + live counters, `Start/Update/Stop/Resolve/RecordSend`.
- **API** — `AutopilotController`: `POST /api/autopilot/loop` (start | update |
  stop), loop state folded into `GET /api/autopilot`. **Every** endpoint is
  fenced by `AutopilotGate` (host-opened, off by default).
- **UI** — `AutopilotConsole`/`LoopsView` (Advanced-gated Autopilot tab).

None of it is used. The adoption gaps (proposal): loops start in the wrong
place with a blank form, driven agents have no output contract, and loop state
is invisible on the dashboard the user actually watches.

## Goals / Non-Goals

**Goals:**
- A loop is startable in one tap from the agent's dock card, seeded by a recipe.
- Driven agents follow a documented output contract (sentinel / needs-human),
  making stop and escalate detection reliable by construction.
- Loop state (looping · n/cap · done · escalated · capped · error) is visible on
  the dock card without opening the Autopilot tab.
- Every stopped loop shows *why* it stopped, so recipes/caps get tuned from
  real runs.

**Non-Goals:**
- No classifier-brain build-out (stub stays a stub; loop mode is the bet).
- No change to the safety posture: gate host-only and off by default, hard cap,
  deny-list, append-only audit all unchanged.
- No push notifications / cross-machine loops (dashboard badge only, this box only).
- No free-form prompt generation by autopilot.

## Decisions

### 1. Recipes are a small backend store, not a frontend catalog

A new `LoopRecipeStore` (`loop-recipes.json`, same atomic-write pattern as
`LoopConfigStore`) holding named templates: `{ id, name, prompt, sentinel,
maxIterations }`. Seeded on first load with two built-ins codifying the real
ritual — **"Drive the feature"** (keep implementing the current OpenSpec change:
next task, verify, commit — until all tasks done) and **"Finish and ship"**
(verify, update docs/understanding-app, commit, open PR). Editable/deletable via
API; re-seeding never overwrites a user edit (same never-reseed guard as the
other stores).

*Why not the client-side `promptCatalog.js`?* Recipes carry loop-only fields
(sentinel, cap) and must be shared by every device hitting the backend; the
catalog is a per-build frontend artifact for composer prompts.

### 2. The output contract lives inside the recipe prompt, visibly

Each recipe's prompt text **ends with the contract paragraph** ("when the whole
job is genuinely done, end your reply with `LOOP_DONE`; if you are blocked on a
decision only the human can make, end with `NEEDS_HUMAN: <the question>` and
stop"). No hidden injection at send time — what the user sees in the recipe
editor is exactly what the agent receives. The agent-agnostic statement of the
contract goes in **`docs/loop-driven-agent-convention.md`** (like
`docs/understanding-app-convention.md`), and CLAUDE.md gets a one-line pointer.

### 3. `NEEDS_HUMAN:` becomes a first-class stop condition

`HandleLoop` gains one check, ordered **error → sentinel → needs-human →
deny-list → cap → resend**: if the last assistant message contains
`NEEDS_HUMAN:` the loop resolves `escalate` and captures the trailing question.
Deterministic string match, same zero-injection-surface property as the
sentinel. The deny-list stays as the backstop for agents that ignore the
contract.

### 4. Stop reasons are recorded, not inferred

`LoopConfigStore.Entry` gains `StopReason` (short machine string: which
condition fired) and `StopDetail` (matched deny word / the NEEDS_HUMAN question
/ "cap 10/10"), written by `Resolve`. Additive JSON fields — old `loops.json`
files load fine. `LoopsView` shows them per loop; this is the "why did it stop"
readout the tuning feedback loop needs.

### 5. Dock badge reads a read-only, non-operator-gated loops endpoint

New `GET /api/autopilot/loops` returning only loop states (+ recipe names):
session-auth like everything else, but **not** fenced by `AutopilotGate`.

This is a deliberate, narrow deviation from "every autopilot endpoint is
gated", for one reason: terminal states (done / escalated / capped) must stay
visible on the dashboard **after** the operator closes the gate, or an
unattended loop's outcome silently disappears — the exact trust-killer that
caused zero adoption. The endpoint discloses loop status only; it cannot arm,
send, or reveal autopilot config. `POST /api/autopilot/loop` (all actions)
stays fully gated. Documented in the convention doc's safety note.

*Alternative rejected:* folding loop state into `GET /api/dock` — couples the
dock module to autopilot and drags loop data into every dock poll on every
surface.

### 6. Start-from-dock is a thin client over the existing loop API

The dock agent card (`PinnedAgent` header area) gets a loop control: badge when
a loop exists, and a "loop this agent" popover listing recipes (pick one →
optional cap tweak → arm) that POSTs the existing `POST /api/autopilot/loop
{action:"start"}` with the recipe's fields. A 403 (gate closed) renders as an
explicit "operator gate is closed — open it on the host" hint, teaching the
gate instead of failing mutely. Stop is the same popover. All of it Advanced-
gated per the UI-modes convention (`UiModeContext` capability map).

The Autopilot tab's `LoopsView` remains the deep console (recipe CRUD,
stop-reason history); the dock affordance is deliberately minimal.

## Risks / Trade-offs

- [Unattended sends drive a real agent with real tools] → posture unchanged and
  already verified e2e: gate off by default, hard cap, deny-list fail-safe,
  append-only audit; NEEDS_HUMAN *adds* an escalation path, none are removed.
- [Sentinel/marker false positive — agent *mentions* `LOOP_DONE` without being
  done] → contract text instructs emitting it only as the final line when
  genuinely done; residual risk accepted (stops early, fails safe — never
  over-runs).
- [Agent ignores the contract and loops burn iterations] → hard cap bounds the
  waste; stop-reason readout makes it visible; recipe prompt gets tuned — that
  measuring loop is this change's point.
- [Read-only loops endpoint weakens the gate-everything rule] → scoped to
  status disclosure only, no action surface, no config; called out explicitly
  in the convention doc so the deviation stays deliberate.
- [Known engine edge: byte-identical consecutive replies stall the dedup guard]
  → unchanged and acceptable; real work varies its replies (documented in
  plans/autopilot-loop-mode.md).

## Migration Plan

Additive throughout: new store file (`loop-recipes.json`), new optional JSON
fields on `loops.json` entries (tolerant load already in place), one new GET
endpoint, frontend additions. No schema breaks, no data migration. Deploy via
the normal `swap.ps1` cycle; rollback = the existing dead-man auto-rollback.

## Open Questions

- The exact wording of the two seed recipes — draft in implementation, tune
  with the user on the first real looped feature.
- Should an `escalate`/`NEEDS_HUMAN` stop eventually raise a push notification
  (the existing PushNotification path) instead of badge-only? Deferred; badge
  first, measure whether escalations get missed.
