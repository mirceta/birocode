# Adopt autopilot loops — make agents prompt agents in the real workflow

## Why

We invested heavily in autopilot — discovery of routine prompts, a suggest-only
classifier, and a fully verified deterministic **loop mode** (fixed-prompt resend
with sentinel/cap/deny-list stops, operator gate, audit trail) — and then **never
used any of it once** in real feature work. The user still babysits every feature
by hand-sending the same ritual prompts (continue → play it back → verify →
deploy → keep it → push it) across agents. The machinery exists; what's missing
is integration into the place where work actually happens, and the workflow
tuning that makes a loop trustworthy enough to leave alone.

The friction points that caused zero adoption, named:

1. **Loops live in the wrong place.** Starting one means leaving the agent you're
   driving, opening the Advanced-only Autopilot tab, and hand-composing a prompt,
   sentinel, and cap from scratch. The moment of need is in the dock/chat; the
   controls are elsewhere and blank.
2. **Nothing tells the driven agent how to behave in a loop.** There is no
   convention making agents emit the sentinel (`LOOP_DONE`) or a clean
   escalation marker, so done-detection only works if the user hand-writes it
   into every loop prompt — which nobody does.
3. **Loop state is invisible where the user looks.** Escalations, caps, and
   done states land in the Autopilot tab; the dashboard/dock — the surface the
   user actually watches — shows nothing, so leaving a loop unattended feels
   unsafe and defeats the point.

## What Changes

- **Loop recipes**: a small set of reusable, named loop templates (prompt +
  sentinel + cap + deny-list posture) codifying the user's real ritual — at
  minimum a "drive the feature" recipe (keep implementing the current OpenSpec
  change until done) and a "finish and ship to PR" recipe. Recipes are seedable
  from the existing discovery/custom-prompt set, editable, and persisted
  server-side.
- **Start a loop where the work is**: a one-tap "loop this agent" affordance on
  the dock agent card / chat surface that picks a recipe and arms the loop —
  no trip to the Autopilot tab. The tab remains the deep-management console.
- **Looped-agent output convention**: a documented, prompt-side contract (in the
  recipe preamble, and as an agent-agnostic doc like the other conventions) that
  a driven agent must end a turn with the sentinel when genuinely done, or an
  explicit `NEEDS_HUMAN: <question>` marker when blocked — so stop/escalate
  detection is reliable instead of accidental.
- **Loop state on the dashboard**: dock cards show a live loop badge
  (looping · iteration n/cap · done · escalated · error), and an escalation is
  a first-class visible cue on the surface the user already watches, so an
  unattended loop is observable at a glance.
- **Workflow tuning, measured**: every stop reason is already audited; surface a
  compact "why did this loop stop" readout so each real run teaches us how to
  tune caps, sentinels, and recipes. The classifier brain stays a stub — this
  change bets on deterministic loops, not the LLM brain.

Non-goals: no new autonomy surface (the operator gate stays host-only and
off by default), no free-form prompt invention by autopilot, no cross-machine
loops, no classifier-brain build-out.

## Capabilities

### New Capabilities

- `autopilot-loops`: the loop engine and its lifecycle — arming a loop on an
  agent, per-turn resend decision, stop conditions (sentinel / cap / deny-list /
  error), gating, audit, and where loops can be started from. Seeds the baseline
  for the already-built loop mode (built pre-OpenSpec, currently spec-less) per
  seed-and-grow, plus the new launch-from-dock behavior.
- `loop-recipes`: named reusable loop templates — their shape, persistence,
  seeding from discovery/custom prompts, and the looped-agent output convention
  (sentinel / needs-human markers) each recipe's preamble enforces.

### Modified Capabilities

- `agent-dock`: dock agent cards additionally surface live loop state (badge +
  iteration count + terminal state) and offer the start-loop affordance.

## Impact

- **Backend**: `AutopilotService` (loop engine tick), `LoopConfigStore`
  (`loops.json`), new recipe store + endpoints on `AutopilotController`
  (`/api/autopilot/loop`, `/api/autopilot` state projection extended with
  recipe + per-repo loop state for the dock).
- **Frontend**: dock agent card (`PinnedAgent`/dashboard) — loop badge + start
  control; `AutopilotConsole`/`LoopsView` — recipe management + stop-reason
  readout. New UI defaults to **Advanced** per the UI-modes convention.
- **Docs/conventions**: agent-agnostic looped-agent contract doc under `docs/`
  (like `docs/understanding-app-convention.md`); CLAUDE.md pointer.
- **Safety posture unchanged**: AutopilotGate (host-opened, off by default),
  deny-list escalation, hard iteration cap, append-only audit all stay as-is.
