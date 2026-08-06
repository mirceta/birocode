# loop-agent-briefing — brief the driven agent on its situation, every send

## Why

A loop-driven agent today receives bare text with zero situational context: the queue
loop sends the stash item verbatim ("do X"), and even the goal/recipe prompts only
state the output contract (markers), not the *posture*. So the agent — which has no way
to know it is talking to an autopilot — behaves as if a live human were on the other
end: it asks a clarifying question instead of acting, answers "here's what I'd do"
instead of doing it, or misreads what the terse item refers to and writes something
else. The step-verification turn then (correctly) refuses `STEP_VERIFIED` and the queue
escalates — turning an avoidable confusion into an operator interrupt. Agents,
especially Fable-class, act well when told the situation; nobody is telling them.
`docs/loop-driven-agent-convention.md` exists, but only agents whose repo CLAUDE.md
points at it ever see it, and it documents the *markers*, not the *behavior*.

## What Changes

- **Every prompt the autopilot sends carries a situational briefing** — a short
  preamble composed with the stored text at send time from a fixed frame plus an
  operator-editable rules list, telling the agent:
  - you are being driven by an autopilot loop; no human reads your replies in real time;
  - act — do the work the prompt asks for, don't answer with a plan or a counter-question;
  - if you would ask a clarifying question, answer it yourself and follow your own
    advice when you are confident; use sensible defaults for open questions;
  - reserve `NEEDS_HUMAN: <question>` for decisions only the human can make — it is the
    escalation path, not the default;
  - (queue items) the applicable marker contract in one line, so agents in repos that
    never read the convention doc still follow it.
- Kinds covered: **queue item sends**, **queue step-verification sends**, **goal
  work/verify prompts**, **recipe sends**. Suggestion mode is out of scope (its
  pending prompt is human-sent from the composer).
- **The briefing's behavioral rules are a stored, operator-editable global list** —
  not compiled-in text. A **Briefing section beside the loop section on every agent
  dock card** shows the rules at all times and takes a new one in two taps, so a
  rule idea is captured the moment it occurs instead of being forgotten; a rule can
  be added disabled (parked) and enabled later, and an enabled edit applies from
  the very next driven send — no deploy. The situational frame, the
  `NEEDS_HUMAN:`/sentinel marker lines, and the verify-phase honesty note stay
  fixed in code so edits can never break the parsed contract or pressure a
  verification turn.
- **Convention amendment (deliberate, must be explicit):** `unify-loop-types` and the
  convention doc's safety posture promise "driven kinds only ever send stored,
  byte-identical text — nothing is injected at send time". This change amends that
  promise to the weaker but still honest form the queue verify template already uses:
  every send is a **deterministic composition of operator-inspectable parts** (the
  fixed briefing frame + the rules list at a recorded revision + the stored text),
  previewable before arming and disclosed in sent-history; the rules store keeps its
  revision history and every briefed send stamps the revision it used, so the exact
  sent text stays reconstructable even after later edits. The convention doc and the
  code comments stating the old promise are updated in the same change — the old
  wording must not survive anywhere.
- `docs/loop-driven-agent-convention.md` gains the behavioral-posture section (act,
  self-answer, sensible defaults) as the single source of truth; the briefing template
  stays consistent with it.
- Operator surfaces stay honest: the arm preview and the queue's sent-history show the
  composed text (or visibly mark the briefing), never pretend the raw item was sent.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `autopilot-loops`: driven sends SHALL carry the situational briefing (per kind),
  composed from a fixed frame and an operator-editable, revisioned rules list;
  prompt-disclosure requirements change from "the stored text verbatim" to
  "deterministic composition of operator-inspectable parts, previewable and disclosed
  as sent".

## Impact

- `ClaudeWeb.App/Services/Autopilot/BriefingRulesStore.cs` (new) — the global rules
  list at `briefing.json`: seeded from draft v1, enable/disable per rule, monotonic
  revision history.
- `ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs` — the fixed briefing frame +
  `ComposeBriefedPrompt`; existing goal/queue-verify templates reworded to drop
  lines the briefing now covers.
- `ClaudeWeb.App/Services/Autopilot/QueueLoop.cs`, `GoalLoop.cs`, `RecipeLoop.cs` —
  propose composed text instead of raw stored text (or the engine composes at send;
  design decides where).
- `ClaudeWeb.App/Services/Autopilot/AutopilotService.cs` — send path, sent-history
  recording (composed vs raw), debug bundle.
- `docs/loop-driven-agent-convention.md` — behavioral posture section + amended safety
  posture wording.
- `AutopilotController` — `GET`/`PUT /api/autopilot/briefing` (session-authed, not
  gate-fenced: harness-authored text, and idea capture must always work).
- Dock UI — new **Briefing** section beside the loop section on every dock card
  (rules list, enable/disable, quick-add, composed preview); `DockLoopControl` arm
  preview + console Loops/Queue sent-history — show the briefing honestly.
- E2e: stub CLI simulator asserts the briefing is present on each send kind, that an
  added rule appears in the next send with the revision stamped, and that a
  brief-then-act reply (no counter-question) passes step verification unchanged.
