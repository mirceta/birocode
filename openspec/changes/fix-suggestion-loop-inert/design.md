# fix-suggestion-loop-inert — design

## Context

The suggestion kind (`SuggestionLoop.cs`) asks the stub `PromptClassifier` to
match the agent's trailing message against the user's custom prompts. Live
evidence (2026-07-28) shows the pipeline is structurally inert:

- Every routine's base confidence is exactly 0.85: the mining enrichment
  (`BuildRoutines`) requires a custom prompt's normalized text to *equal* a
  mined routine key, which never happens for multi-sentence prompts. So
  triggers are only the prompt's own words and confidence caps at 0.85.
- Threshold 0.75 therefore demands ≥ 88% match strength — the assistant's
  reply must contain `max(2, ceil(triggers/4))` words of the *prompt's*
  vocabulary. Result: every `Classify` ends in escalate; `Execute` maps that
  to a Hold visible only in the Autopilot console.
- The engine's `Tick()` iterates `_repos.GetAll().Where(r => r.Exists)`, so
  an armed loop on a deleted/moved repo (live: web-flow-autodev) is skipped
  with no state, no log, and no resolution.
- The deny-list fence matches `best.Label.Contains(term)` over the whole
  prompt text — "…merge to master…" inside a prompt permanently escalates it.

The engine's mechanics (dedup guards, intercepts, suggest/drive dispatch,
gate/kill-switch fencing) are sound — the goal loop proved them end-to-end on
live the same day. The fix targets the suggestion kind's decision quality and
the visibility of decisions.

## Goals / Non-Goals

**Goals:**

- An armed 💡 suggestion loop in suggest mode visibly produces a pending
  suggestion on the next new agent message — every time, not only on a
  (practically unreachable) full-confidence match.
- The user can see, at the dock where they armed it, what the loop last
  decided and why (held / escalated / suggested / sent + reason).
- A loop armed on a repo whose folder is gone resolves with an explicit
  error instead of being silently skipped forever.
- Deny-list terms block routines only on whole-word matches, and the
  escalate reason names the matched term.
- Slice 2: a real Claude-CLI-backed classifier behind the existing
  `{label, confidence} → gate` contract so drive-mode auto-sends become
  actually reachable.

**Non-Goals:**

- No change to drive-mode safety: the threshold + deny-list + kill switch +
  operator gate still fence every automatic send exactly as today.
- No change to recipe/goal kinds, the conversation pin, or the arm-freshness
  rules.
- No new disclosure surface: decision words follow the status-word rules;
  prompt-bearing text (labels, reasons quoting prompts) stays behind the
  operator gate, same as `pendingPrompt` today.
- Not redesigning the routine-prompt library or mining.

## Decisions

### D1 — Suggest mode always pends the best candidate

`SuggestionLoop.Decide` distinguishes the instance's mode (available on
`ctx.Loop`):

- **suggest**: if the classifier found *any* best candidate (even below
  threshold), return `Propose(label, confidence)` — the engine records it as
  the pending prompt with its confidence, pre-filling the composer for the
  human. Verdicts with no candidate at all ("no routine matched",
  "no message") and deny-listed candidates stay Holds with their reason.
- **drive**: unchanged — only a verdict at/above threshold proposes; the
  engine's cap + audit + send path is untouched.

Why not just lower the threshold? It tunes a broken meter: with the stub's
0.85 cap the "right" threshold is a magic number, and a no-overlap message
would still produce silent nothing. Pending-with-confidence is honest — the
human sees exactly how sure the brain is — and is safe because suggest mode
never sends. The `PromptClassifier.Verdict` already carries the best label +
confidence in its below-threshold branch, so this is a mode-aware mapping
change in the kind, not a classifier rewrite.

### D2 — Missing repos resolve, not skip

`Tick()` iterates all registered repos; for a repo with `Exists == false`
and an *active* loop instance it calls
`Resolve(repoId, "error", "repo-missing", <path>)` (once — Resolve clears
`Active`) and surfaces the terminal state like any other stop. Repos without
an active loop are still skipped as before. Alternative — keeping the skip
and only badging the dock — leaves a "looping" record that lies forever;
resolving matches how every other impossible-to-continue condition ends.

### D3 — Decision readout on the dock

The engine already holds one `AgentState` per repo (decision, label,
confidence, reason). Add to the ungated `/api/autopilot/loops` projection:

- `decision` (status word: off | running | idle | suggestion | escalate |
  paused | sent) — ungated, like `kind`/`mode`/`phase`.
- `decisionReason` + `decisionLabel` + `decisionConfidence` + `decisionAt` —
  disclosed only while the gate is open, exactly the `pendingPrompt` rule
  (reasons and labels can quote prompt text).

`DockLoopControl` renders a live "last decision" line for an armed
suggestion instance (e.g. "escalated — below threshold (0.42 < 0.75)") and
the pending chip it already has. No new endpoint, no new polling loop — the
dock already polls the loops projection.

### D4 — Word-scoped deny-list with a named reason

`Classify` matches deny terms with word-boundary semantics (case-insensitive
`\b<term>\b`-style match over the prompt text; multi-word terms like
"reset --hard" match as substrings with boundary edges). The escalate reason
becomes `"…" contains deny-listed "<term>"`. The fence still applies in both
modes (a deny-listed routine is never pended or sent — arming safety stays
conservative); what changes is the false-positive rate and that the reason is
now visible on the dock (D3), so the user can curate the list.

### D5 — Slice 2: CLI classifier behind the same contract

A `CliPromptClassifier` implements the same
`Classify(message, threshold, denyList, routines) → Verdict` contract via a
one-shot `claude -p` call (fast/cheap model, JSON out: chosen routine index
or abstain + confidence + one-line reason). Constraints that shape it:

- **Off the tick path.** A CLI call takes seconds; the 10s tick must not
  block. Per-repo single-flight: a tick that sees a NEW trailing message
  starts a background classification and Holds ("classifying…"); a later
  tick consumes the cached verdict. The existing per-message dedup
  (`_lastIntercepted` / `_suggestWait` / `_lastDriveSent`) already bounds
  call volume to one per new agent message.
- **Fallback.** On CLI error/timeout the stub verdict is used and the
  reason notes the fallback — the loop never wedges on a broken CLI.
- **Selection.** `autopilot.json` gains `Brain: "stub" | "cli"`; the engine
  resolves the classifier per tick. Ship default: `cli` (the whole point of
  the feature), stub retained as the kill-switch-adjacent fallback setting.
- Gate/threshold/deny-list apply to the CLI verdict identically — the brain
  proposes, the gate disposes.

Slice 2 is separable: slice 1 alone already makes the armed loop visibly
alive; slice 2 makes drive mode genuinely useful. If slice 2 slips, slice 1
still ships.

## Risks / Trade-offs

- [Always-pending suggestions may be low quality under the stub] → the chip
  shows the confidence; nothing sends without the human; slice 2 replaces
  the scorer. The suggest-wait guard means at most one pending per new
  agent message — no flicker.
- [CLI classifier cost/latency] → single-flight per repo + per-message dedup
  caps calls at one per new trailing message per armed repo; fast model;
  timeout with stub fallback.
- [Decision fields could leak prompt text with the gate closed] → only the
  bare decision word is ungated; reason/label/confidence follow the
  existing `pendingPrompt` gate-conditional pattern, asserted in the e2e.
- [Resolving missing-repo loops surprises a user who un-deletes the folder]
  → re-arming is one click, and an explicit `error: repo-missing` beats a
  silent no-op; the debug bundle already names the path.
- [Word-boundary deny matching is weaker than substring] → it still catches
  every real term in the current list; the visible reason makes any gap
  auditable. The safety-critical fence for *sends* remains threshold + cap +
  kill switch + gate, unchanged.

## Migration Plan

No data migration. On first deploy the live web-flow-autodev suggestion
instance resolves itself as `error: repo-missing` on the first tick.
`autopilot.json` deserializes the new `Brain` field additively (absent →
default). Rollback = standard `swap.ps1` dead-man auto-rollback.

## Open Questions

- Slice 2 model choice for the CLI call (default: the cheapest current
  Claude model the CLI exposes on this box) — confirm with the operator at
  implementation time.
- Should a deny-listed routine be pendable in suggest mode (human sends
  anyway)? Shipping conservative (never pended); revisit if the user asks.
