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
- The behavioral rules of that briefing are an **operator-editable stored list** —
  the operator collects rule ideas continuously and needs a place to put them the
  moment they occur; editing must not require a deploy. Ideas can be parked
  (disabled) and enabled later.
- Keep prompt inspection honest: every send is a deterministic composition of a
  fixed frame (code) + the rules list at a recorded revision (stored) + the stored
  text, previewable at the arm surfaces and reconstructable for every recorded send.
- Keep operator-facing surfaces readable: chat bubble, audit rows, and sent-history
  keep showing the *stored* text, visibly marked as sent-with-briefing.
- The convention doc stays the single source of truth; the briefing text is its
  distilled form and both are updated together.

**Non-Goals:**

- Suggestion mode (its pending prompt is human-sent from the composer — a human IS in
  the loop there).
- Per-loop or per-repo briefing variation: the rules list is ONE global list — the
  same briefing frames every driven agent; scoping can come later if real runs
  demand it.
- Editability of the briefing's fixed frame, the verify-phase note, or the
  marker/contract lines — those stay compiled-in (D2b: parser-coupled and
  safety-coupled text must not drift under casual edits).
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

### D2 — One global briefing: a fixed frame around an operator-editable rules list

The work-phase briefing is composed at send time from two layers:

1. a **fixed frame** — compiled-in consts in `LoopConfigStore` beside the existing
   templates: the `[Autopilot loop briefing]` header, the situational statement
   (automated loop, no live human reading in real time), the `NEEDS_HUMAN:`
   escalation line, the kind/phase contract line, and the
   `--- The prompt follows. ---` separator;
2. the **enabled rules** from the stored briefing rules list (D2b), rendered as
   bullet lines between the situational statement and the escalation line — this is
   where "act rather than answer", "self-answer confidently held questions",
   "sensible defaults" live, seeded as draft v1 and growable by the operator.

The contract line is selected by kind+phase:

- queue work item: "this is one item of a stored queue; a separate verification turn
  follows; no done-marker is needed for this item."
- queue verify / goal verify: the verify templates already state their marker; the
  briefing contributes only a short honesty-first situational note (no posture
  pressure, no duplicate marker line — see D2a).
- goal work: sentinel line (`LOOP_DONE` final-line contract).
- recipe: sentinel line using the loop's configured `Sentinel` (recipes may override
  the default).

`ComposeBriefedPrompt(kind, phase, sentinel, storedText)` renders
`frame(enabled rules) + "\n\n" + storedText` from the CURRENT store state — an
edit applies from the very next send. The existing goal/recipe templates keep their
own marker/escalation sentences UNCHANGED (implementation refinement): suggest-mode
pends deliver stored text raw, and a mid-run mode flip must not strand an untaught
agent, so stored prompts stay self-sufficient — a drive send repeats the marker line,
the same instruction twice, harmless (the double-instruction risk below already
covers this shape).

### D2a — The briefing text itself is the heart of this change (draft v1)

The plumbing above is deliberately small; what makes or breaks the feature is the
prompt. Draft v1 — the frame lives as consts in `LoopConfigStore`, the two bullet
rules seed the editable store (D2b) and are tuned live from real runs:

**Work-phase composition** (queue item / goal work / recipe):

```
[Autopilot loop briefing]
This prompt was sent by an automated loop. It was not typed live by a human, and
nobody is reading your reply in real time — a reply that only asks or plans goes
nowhere.
{enabled rules from the store, one "- " bullet each; seeded with:}
- Do the work in this turn. Do not stop at a plan, a list of options, or a
  clarifying question.
- Answer your own questions and follow your own advice when you are confident.
  Choose sensible defaults for open details and state briefly which you chose.
{fixed frame resumes:}
- Only if a decision genuinely requires the human — irreversible, destructive,
  or a preference only they can give — stop and end your reply with the final
  line: NEEDS_HUMAN: <one short question>
{contract line}
--- The prompt follows. ---
```

The `NEEDS_HUMAN:` bullet is deliberately part of the FIXED frame, not a seeded
rule: it teaches the exact final-line marker the engine parses, so it must never be
deletable or editable from the UI.

Contract lines: queue item — "Below is one item from a stored queue; a separate
verification turn follows automatically, so print no completion marker."; goal
work / recipe — "When the whole job below is genuinely complete — not before —
end your reply with the exact final line: {sentinel}".

**Verify-phase note** (queue step-verify / goal verify) — intentionally NOT the
work composition; a verification turn must feel no "act, don't ask" pressure, so
the editable rules NEVER compose into it (structurally: the verify note is one
fixed const, no rules slot):

```
[Autopilot loop briefing]
This verification prompt was sent by an automated loop; nobody is reading in
real time. Judge honestly — a false confirmation silently corrupts the run,
while an honest refusal merely stops the loop for a human to look at.
```

Crafting constraints that bound future tuning:

- **Short**: the work composition should stay around ~120 words so it frames the
  stored prompt without diluting it. Rule count is operator-controlled now, so the
  editor renders the full composed preview (D5) and shows a soft too-long hint
  rather than hard-limiting.
- **Prefix, not suffix**: situational framing must land before the task text; the
  `--- The prompt follows. ---` separator keeps the operator's text visually and
  semantically distinct from the harness's.
- **Exact-final-line phrasing** for `NEEDS_HUMAN:` and the sentinel, matching the
  final-line anchoring the engine already parses (fix-loop-conversation-identity) —
  the briefing must never teach a marker format the parser would miss.
- **One voice with the convention doc**: the briefing is the doc's distilled form;
  any tuning edits both in the same commit (D4).

Alternative rejected: folding the posture into each arm-time template — leaves recipe
and queue items unbriefed (they have no template) and re-scatters the text the
convention doc is supposed to own.

### D2b — Briefing rules store: global, seeded, revisioned

A new `BriefingRulesStore` (beside `LoopRecipeStore`) persists the rules at
`briefing.json` under the app data dir (via AppPaths, so an isolated
`CLAUDEWEB_DATADIR` instance keeps its own), with the same atomic temp+rename write
and never-reseed-on-unreadable load guard as the other autopilot stores.

- Model: `{ rev, rules: [ { id, text, enabled } ], revisions: [ { rev, savedAt,
  rules } ] }`. First load with no file seeds the two draft-v1 rules at rev 1.
- **Disabled rules are the parking lot**: an idea is captured the moment it occurs
  by adding it disabled; enabling it later ships it into every subsequent driven
  send. Nothing is forgotten, nothing half-baked leaks into prompts.
- Every save appends the outgoing state to `revisions` and bumps `rev`
  (monotonic). Every briefed send stamps the `rev` it composed with (D3), so the
  exact sent text stays reconstructable forever even though the list mutates:
  fixed frame (git-versioned code) + rules-at-rev (briefing.json) + recorded raw
  text. This is what keeps the "deterministic composition of operator-inspectable
  parts" promise TRUE for a mutable template.
- The store holds ONLY work-phase rules. The frame, contract lines, and the
  verify-phase note are compiled consts — an operator edit can never add act
  pressure to a verification turn or break the `NEEDS_HUMAN:`/sentinel final-line
  format the engine parses.

Endpoints: `GET /api/autopilot/briefing` (rules + rev + the fixed frame text for
honest preview) and `PUT /api/autopilot/briefing` (replace rules; server bumps
rev). Session-authed but NOT `AutopilotGate`-fenced: the rules are operator-authored
harness text (never repo content, unlike the gated pending-prompt disclosure), and
capturing an idea must work whenever the dock is visible. The sends that consume
the rules stay gate-fenced exactly as before.

Alternative rejected: compiled-in rules consts (this change's own v1 shape) — the
operator collects briefing-rule ideas continuously and a const turns every idea
into a deploy; ideas were being lost for lack of a place to put them.

### D3 — Record raw text + a briefed marker; disclose the composition, not per-send copies

What was *actually sent* is `briefing + stored text`, and that must stay
reconstructable — but every truncated surface (audit rows, sent-history snippets, the
chat's synthetic user bubble, state snippets) would render as the identical briefing
prefix if we recorded the composed text verbatim. So:

- Audit entries, `QueueSentTexts` history, and the synthetic `user` event keep
  carrying the RAW stored text, plus a briefed flag (`briefed: true` on the user
  event; the sent-history/audit projections mark loop sends as briefed) and the
  briefing rules revision the send composed with (D2b).
- The current briefing composition (fixed frame + enabled rules) is disclosed live:
  in the dock Briefing editor's preview (D5), the gated loop detail, and the arm
  preview surfaces (DockLoopControl), exactly like the goal composition preview
  today. Sent text = frame + rules-at-recorded-rev + recorded raw text,
  deterministically — the honesty contract of the proposal, revision-proofed
  against later edits.
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

### D5 — The Briefing editor lives beside the loop section on the dock card

The operator's stated workflow is "I get briefing-rule ideas all the time and
forget them for lack of a place to put them" — so the editor must be where the
operator already looks, not buried in the console. The dock card gains a compact
**Briefing** section directly beside the loop section (`DockLoopControl`):

- Collapsed: an always-visible one-line affordance — "Briefing · N rules" (enabled
  count over total) — same visual weight as the loop header line.
- Expanded: the rules list (enable/disable toggle per rule, inline edit, delete), a
  quick-add input (adding from the quick-add creates the rule ENABLED; a toggle
  parks it), and the full composed work-phase preview (frame + enabled rules) with
  a soft too-long hint (~120 words, D2a).
- The section states plainly that the list is GLOBAL — one briefing for every
  agent's driven sends; it renders on each dock card for reachability, not
  per-agent scoping. Edits from any card write the same store.
- New-UI-feature default applies: capability `'advanced'` in `UiModeContext`.

Alternative rejected: an Autopilot-console-only editor — correct place for
inspection surfaces, wrong place for idea capture; the dock card is what the
operator has open when the idea strikes.

## Risks / Trade-offs

- [Agents rubber-stamp `STEP_VERIFIED` because the briefing says "act, don't ask"] →
  D2a splits the text: verify sends get the honesty-first note, never the work core,
  and the verify templates keep demanding honest refusal; e2e asserts an
  unaccomplished step still escalates.
- [An operator-authored rule injects act pressure into verification turns] →
  structurally impossible: the store holds work-phase rules only; the verify note is
  one fixed const with no rules slot (D2b).
- [Operator deletes or disables every rule] → the fixed frame still briefs the
  situation, the `NEEDS_HUMAN:` escalation line, and the contract line — a driven
  send is never unbriefed, only minimally briefed.
- [The list mutates between sends, so "what was sent" becomes ambiguous] → every
  send stamps the rules revision it composed with, and `briefing.json` keeps the
  revision history — reconstruction stays exact (D2b/D3).
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

Ship as one slice (backend store + compose + record flags, then UI), verify on an
isolated port with the stub CLI simulator, deploy via the standard `swap.ps1` cycle.
No data migration: `briefing.json` is seeded on first read (absent file = seed the
draft-v1 rules at rev 1); `loops.json` records gain optional flag/rev fields; absent
= old rows, rendered as before. Rollback = redeploy previous build (dead-man switch
as usual; `briefing.json` is ignored by old builds).

## Open Questions

- Tuning of the D2a draft wording from real runs — the rules tune live via the dock
  editor, the frame via code; the crafting constraints in D2a bound both.
- Whether the chat bubble affordance ships in this change or the flag alone suffices
  initially (flag is required; the affordance is small and should ride along unless it
  drags).
