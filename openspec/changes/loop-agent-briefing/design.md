# loop-agent-briefing — design

## Context

Every driven-loop send today delivers stored text with no situational framing:

- **Queue** (`QueueLoop.cs`): proposes the stash head's raw text; the step-verification
  prompt (`LoopConfigStore.QueueVerifyTemplate`) is the one send-time composition.
- **Goal** (`GoalLoop.cs`): work/verify prompts composed ONCE at arm time from
  `GoalWorkTemplate`/`GoalVerifyTemplate` and stored on the loop record. They state the
  marker contract but nothing about the situation or posture.
- **Recipe** (`RecipeLoop.cs`): resends the stored recipe text verbatim.

All drive sends funnel through the ONE send path, `AutopilotService.SendPrompt`
(`AutopilotService.cs:698`), which audits the prompt, emits the synthetic `user` event
into the run buffer (openspec: fix-loop-prompt-render), and runs the CLI. The suggest
mode branches off earlier (`SetPending`) and never reaches it.

The driven agent therefore behaves as if a live human sent the message: it asks
clarifying questions, replies with plans instead of acting, or misreads terse queue
items. `docs/loop-driven-agent-convention.md` documents the output contract, but only
agents whose repo points at it ever read it — and it doesn't state the behavioral
posture at all.

Standing constraint being amended (proposal): `unify-loop-types` promised "driven kinds
only ever send STORED, byte-identical text". The queue verify template already carved
out the honest weaker form: **deterministic composition of operator-inspectable
parts**. This change generalizes that carve-out to every driven send.

## Goals / Non-Goals

**Goals:**

- Every drive-mode send (queue item, queue step-verify, goal work/verify, recipe)
  carries a short situational briefing: autopilot context, no live human, act don't
  ask, self-answer with sensible defaults when confident, `NEEDS_HUMAN:` only for
  human-only decisions, plus the kind/phase-appropriate marker line.
- Keep prompt inspection honest: the briefing is a fixed template, previewable at the
  arm surfaces and reconstructable for every recorded send.
- Keep operator-facing surfaces readable: chat bubble, audit rows, and sent-history
  keep showing the *stored* text, visibly marked as sent-with-briefing.
- The convention doc stays the single source of truth; the briefing text is its
  distilled form and both are updated together.

**Non-Goals:**

- Suggestion mode (its pending prompt is human-sent from the composer — a human IS in
  the loop there).
- Per-loop customizable briefing text (one fixed template; customization can come
  later if real runs demand it).
- Retroactively rewriting prompts of already-armed loops (they pick up the briefing on
  their next send, which is where it matters).
- Any LLM-side change to verification strictness — the verify wording keeps demanding
  honest refusal over eager completion.

## Decisions

### D1 — Compose at the engine's send choke point, not in the kinds

The briefing wraps the proposed text in `AutopilotService`'s drive branch of
`case LoopDecision.Propose` (or equivalently inside `SendPrompt`), NOT inside each
kind's `DecideCore`. Rationale:

- One choke point covers all four send shapes (queue item, queue verify, goal
  work/verify, recipe) with zero per-kind drift, and suggest mode is structurally
  excluded because its branch returns before the send path.
- `propose.Prompt` stays the RAW stored text everywhere the engine stamps or records
  it: `RecordQueueStep` must stamp the raw item (the verify template quotes it back —
  quoting a briefed composition would nest briefings), and the stash consume ref, the
  pending-consume map, and state snippets all keep meaning "the operator's text".

Alternative rejected: composing in `DecideCore` per kind — would brief the text that
`RecordQueueStep`/verify-quoting/state snippets consume, forcing raw/briefed
bookkeeping into every kind.

### D2 — One fixed briefing template with a per-kind/phase contract line

`LoopConfigStore` gains briefing constants beside the existing templates: a shared
situational core (autopilot loop, no live human reading in real time, act rather than
answer, self-answer confidently held questions, sensible defaults, `NEEDS_HUMAN:` is
the escalation path not the default) plus one contract line selected by kind+phase:

- queue work item: "this is one item of a stored queue; a separate verification turn
  follows; no done-marker is needed for this item."
- queue verify / goal verify: the verify templates already state their marker; the
  briefing contributes only the situational core (no duplicate marker line).
- goal work: sentinel line (`LOOP_DONE` final-line contract).
- recipe: sentinel line using the loop's configured `Sentinel` (recipes may override
  the default).

`ComposeBriefedPrompt(kind, phase, sentinel, storedText)` returns
`briefing + "\n\n" + storedText`. The existing goal/queue-verify templates are
reworded in the same change to drop lines the briefing now covers (no duplicated
posture text), keeping their marker-specific instructions.

Alternative rejected: folding the posture into each arm-time template — leaves recipe
and queue items unbriefed (they have no template) and re-scatters the text the
convention doc is supposed to own.

### D3 — Record raw text + a briefed marker; disclose the template, not per-send copies

What was *actually sent* is `briefing + stored text`, and that must stay
reconstructable — but every truncated surface (audit rows, sent-history snippets, the
chat's synthetic user bubble, state snippets) would render as the identical briefing
prefix if we recorded the composed text verbatim. So:

- Audit entries, `QueueSentTexts` history, and the synthetic `user` event keep
  carrying the RAW stored text, plus a briefed flag (`briefed: true` on the user
  event; the sent-history/audit projections mark loop sends as briefed).
- The briefing template itself is disclosed once: in the gated loop detail and the arm
  preview surfaces (DockLoopControl), exactly like the goal composition preview today.
  Sent text = disclosed template + recorded raw text, deterministically — the honesty
  contract of the proposal.
- The chat bubble renders the raw text with a small "sent with autopilot briefing"
  affordance (it already knows `actor: "loop"`; the flag makes it explicit and lets
  the user expand/read the briefing text from the loop detail).

Alternative rejected: recording composed text everywhere — honest but makes every
truncated view identical noise and bloats `loops.json` with N copies of the same
fixed prefix.

### D4 — Convention doc gains the posture; safety-posture wording amended

`docs/loop-driven-agent-convention.md`:

- New section "How to behave" (act don't ask; follow your own advice when confident;
  sensible defaults; when you'd explain, do; `NEEDS_HUMAN:` reserved for human-only
  decisions) — the briefing template is its distilled form and cites it.
- "The situation you are in" notes that the loop now *tells* the agent this situation
  in every prompt, so agents in repos that never read the doc still get the contract.
- Safety posture paragraph rewritten from "the prompt you receive is exactly the
  stored text … nothing else is injected at send time" to the deterministic-composition
  form (fixed inspectable briefing + stored text; the queue verify template as before).
  The stale absolute wording must also be removed from the `LoopConfigStore` class
  summary ("Driven kinds only ever send STORED, byte-identical text").

## Risks / Trade-offs

- [Agents rubber-stamp `STEP_VERIFIED` because the briefing says "act, don't ask"] →
  the briefing's verify-phase form contains no "act" pressure (situational core only),
  and the verify templates keep demanding honest refusal; e2e asserts an unaccomplished
  step still escalates.
- [Truncated surfaces show briefing noise] → D3: raw text + flag recorded, composed
  text never stored per-send.
- [Double instruction for repos whose CLAUDE.md already points at the convention doc]
  → harmless by construction: the briefing is the doc's distilled form, kept in sync in
  the same change whenever either moves.
- [Briefing grows the per-send token cost] → fixed, short (~6 lines); negligible next
  to a real work turn.
- [Old promise survives somewhere ("byte-identical text")] → the change greps for the
  old wording across docs/, understanding-app/, and code comments; honesty pass is a
  task, not a hope.
- [Already-armed goal loops carry old-template stored prompts] → acceptable: the
  briefing wraps at send time regardless; stored text is only the goal-specific part.

## Migration Plan

Ship as one slice (backend compose + record flags, then UI disclosure), verify on an
isolated port with the stub CLI simulator, deploy via the standard `swap.ps1` cycle.
No data migration: `loops.json` records gain an optional flag; absent = old rows,
rendered as before. Rollback = redeploy previous build (dead-man switch as usual).

## Open Questions

- Exact briefing wording — drafted in `LoopConfigStore` consts, tuned from real runs
  like the goal/queue templates before it (explicitly marked as draft wording).
- Whether the chat bubble affordance ships in this change or the flag alone suffices
  initially (flag is required; the affordance is small and should ride along unless it
  drags).
