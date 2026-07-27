# unify-loop-types — design

## Context

The loop engine (`AutopilotService.HandleLoop`) is a sound deterministic
resend machine, but its surface grew crooked:

- The fixed-prompt loop shipped labeled "🎯 goal-based" although the user
  never states a goal — they pick a stored **recipe** (a ritual prompt like
  the OpenSpec-change driver) and the loop trusts the agent's own `LOOP_DONE`.
- Suggestion-arming (`AutopilotConfigStore.ArmedRepoIds`) and a loop
  (`LoopConfigStore`) can both be armed on one repo; only a runtime precedence
  branch in `Tick()` keeps them from double-sending. Armed-state is therefore
  ambiguous to the user.
- The dock popover (`DockLoopControl.jsx`) stacks two independent sections
  with no way to see the prompt being armed, and disarming lives in different
  places per mode.

## Goals / Non-Goals

**Goals:**

- One honest taxonomy: 💡 suggestion loop, 📋 recipe loop (rename of today's
  loop), 🎯 goal loop (new — free-text goal + deterministic verification pass).
- XOR arming per repo, enforced in one server-side place.
- One dock control: type picker → per-type parameters → prompt inspection →
  arm / single disarm.
- Prompt transparency: what the engine will send is inspectable byte-identical
  before and after arming (behind the operator gate, like all prompt reads).

**Non-Goals:**

- No LLM judge. The goal loop's verification is still the driven agent
  executing a verification *turn* with a deterministic sentinel — not a second
  model scoring the work. (A separate-judge pass can be a later change.)
- No queue-based loop (still future).
- No change to the operator-gate model, kill switch, deny list, or audit log.
- No redesign of the console beyond renames and showing the new fields.

## Decisions

### D1 — Loop kind lives on the loop entry (`kind: recipe | goal`)

`LoopConfigStore.Entry` gains `Kind` (default `recipe` so existing
`loops.json` entries load unchanged), plus goal-only fields: `Goal` (the
user's text), `VerifyPrompt`, and `Phase` (`work | verify`). The recipe path
keeps `Prompt` as the resend text; the goal path stores BOTH composed prompts
at arm time and the engine sends only stored text — nothing is composed at
send time, so inspection is byte-honest (same principle recipes already
follow).

*Alternative considered*: a separate `GoalLoopStore`. Rejected — the engine,
projection, XOR rule, and dock badge all want "the one loop on this repo";
two stores reintroduce the ambiguity this change removes.

### D2 — Goal-loop prompt composition is server-side, template-constant

Two constants next to `ContractParagraph` in the store layer:

- **Work prompt** = "Work toward this goal until it is genuinely achieved:\n
  \<goal\>\n\n" + existing `ContractParagraph` (LOOP_DONE / NEEDS_HUMAN).
- **Verify prompt** = "You declared the goal done. Goal:\n\<goal\>\n\n
  Critically verify against the actual state of the repository (build, tests,
  running behavior) — not your memory of it. If the goal is genuinely
  achieved, end your reply with GOAL_VERIFIED as the final line. If not, list
  what is missing and continue working toward the goal." + NEEDS_HUMAN
  sentence.

The gated detail endpoint returns the templates so the dock can preview the
exact composition (client substitutes the goal text for preview only; the
server composes authoritatively at arm time).

### D3 — Goal-loop state machine (deterministic, ordered)

`HandleLoop` keeps the existing ordered checks; only the sentinel branch
forks by kind:

1. run errored → `error` (unchanged)
2. `NEEDS_HUMAN:` → `escalate` (unchanged; checked before sentinel so a
   blocked agent is never re-driven)
3. deny-list hit → `escalate` (unchanged)
4. sentinel handling:
   - **recipe**: `LOOP_DONE` present → `done` (unchanged behavior)
   - **goal, phase=work**: `LOOP_DONE` present → send **verify prompt**,
     set phase=verify (counts as an iteration, audited)
   - **goal, phase=verify**: `GOAL_VERIFIED` present → `done`
     (reason `verified`); otherwise phase→work and fall through to resend
5. cap reached → `capped` (checked before any send, including the verify send)
6. resend the kind's work prompt

NEEDS_HUMAN/deny/cap ordering is unchanged, so the goal loop inherits every
existing safety property. All matching stays case-insensitive string search.

*Alternative considered*: verification via a fresh session or second model.
Rejected for this change (see Non-Goals) — same-session verification is
cheap, deterministic to arbitrate, and already materially better than
trusting the bare done-claim; the prompt explicitly demands re-checking real
state, not memory.

### D4 — XOR is enforced by a small `AutopilotArming` coordinator

New `AutopilotArming` service owning the invariant "at most one autopilot
mode armed per repo": `ArmSuggestion(repoId)` stops any active loop then
arms; `ArmLoop(...)` (recipe or goal) disarms suggestion then starts the
loop; `Disarm(repoId)` stops the loop and/or disarms suggestion — one call,
whatever is armed. The controller routes all arming/disarming through it;
`AutopilotConfigStore`/`LoopConfigStore` stay dumb persistence. The engine's
loop-first precedence in `Tick()` remains as defense-in-depth (e.g. a stale
`loops.json` hand-edit), no longer as the primary semantics.

Displacement is silent-by-design at the API layer (arming returns the fresh
state; the UI shows what happened) — but the dock UI states it up front
("arming this replaces X") so the XOR is visible before the click.

### D5 — Disclosure boundaries stay two-tier

- Ungated `GET /api/autopilot/loops` gains per-loop `kind` and `phase` only —
  both status words. Goal text is prompt content → NOT disclosed here.
- New **gated** `GET /api/autopilot/loops/detail`: full loop records (prompt,
  goal, verify prompt, phase), full recipe bodies, and the goal templates.
  The dock popover fetches it on open; a 403 renders the existing
  gate-closed hint and the popover degrades to status-only (arm controls
  hidden behind the same hint, as today).

### D6 — Naming migration for planted seeds

Seed recipes rename to name their ritual: "Drive the OpenSpec change" /
"Finish and ship the change". `LoopRecipeStore.Seed()` gains a one-time
migration: a planted seed whose name AND prompt are still byte-identical to
the OLD seed constants is rewritten to the new constants; anything the user
edited or deleted is untouched (the SeededIds guard keeps its existing
semantics). This gets live installs onto honest names without ever clobbering
user edits.

## Revision 2 decisions (interface remodel)

### D7 — `ILoop` interface; kinds are implementations (supersedes the shape of D3/D4)

```
ILoop { string Kind; LoopDecision Decide(LoopContext ctx); }
```

`LoopContext` carries the loop instance, the agent's trailing assistant
message, run-error state, and (for the suggestion kind) the classifier inputs.
`LoopDecision` is one of: **hold** (stay armed, surface a reason — the
suggestion kind's non-terminal escalate), **stop** (terminal status + reason +
detail), or **propose** (the next prompt, optionally a phase to enter).
Implementations: `SuggestionLoop` (wraps `PromptClassifier`), `RecipeLoop`,
`GoalLoop` — the driven kinds share the ordered error → NEEDS_HUMAN →
deny-list ladder in a `DrivenLoop` base class, preserving D3's ordering
exactly. The engine owns only mechanics: idle detection, dedup guard, the cap
check before any drive-mode send, sending, pending-suggestion recording,
auditing, state records.

### D8 — One store slot per agent; XOR is structural; `AutopilotArming` deleted

`LoopConfigStore` becomes the single per-agent loop registry: kind
`suggestion | recipe | goal`, common `Mode`, per-kind params. One dictionary
slot per repo ⇒ arming anything replaces whatever was armed (the displaced
active instance is resolved as user-stopped, as the coordinator did) — the
invariant needs no coordinator, so `AutopilotArming` is deleted.
`AutopilotConfigStore` keeps only global engine settings (kill switch,
threshold, deny list); its legacy `ArmedRepoIds`/`AutoAdvance` are drained
once at startup into suggestion instances (`mode = drive` iff auto-advance was
on).

### D9 — `mode: suggest | drive` on every loop; pending prompt disclosure

Every decision that proposes a next prompt dispatches on the instance's mode:
**drive** sends it (existing capped, audited send path); **suggest** records
it as the instance's `PendingPrompt`, which the dock chat surfaces by
pre-filling the composer (the user sends by hand; the loop advances when the
agent's reply changes). Suggest mode never auto-sends, so the cap only gates
drive-mode sends. Disclosure: `pendingPrompt` is prompt text, so the ungated
status projection carries it ONLY while the operator gate is open (with the
gate closed the engine is idle and no pending prompt exists to disclose —
the closed-gate disclosure surface is unchanged). Suggestion instances are
uncapped by default (`maxIterations = 0` = no cap).

## Risks / Trade-offs

- [Self-verification is weaker than an independent judge] → The verify prompt
  demands checking actual repo/build/test state; the loop still ends `capped`
  / `escalate` under the same caps and deny rules; a judge pass is an
  explicit future change.
- [A goal-turn reply that already contains "GOAL_VERIFIED" in phase=work]
  → phase=work only matches `LOOP_DONE`; `GOAL_VERIFIED` is only meaningful
  in phase=verify, so a premature token cannot skip the verification turn.
- [Verify send burns an iteration near the cap] → acceptable: cap is the
  hard safety bound; the status readout shows `capped` with the phase so the
  user sees verification didn't complete.
- [Old dock/console labels linger somewhere] → tasks include a repo-wide
  sweep for "goal-based" wording plus the understanding-app honesty pass.
- [Existing armed suggestion + active loop pairs at upgrade time] → first
  arming action through the coordinator normalizes the repo; until then the
  engine's precedence branch behaves exactly as before.

## Migration Plan

Additive JSON fields (`kind` defaults to `recipe` on load) — old `loops.json`
and `loop-recipes.json` need no rewrite. Seed rename runs once under the
byte-identical guard. Rollback = deploy previous build; new fields are
ignored by old code (System.Text.Json skips unknown members).

## Open Questions

None blocking. Verify-prompt wording is expected to be tuned from the first
real goal-loop runs (same stance as the seeded recipes took).
