# Wire the discovered routine set into the classifier (the brain's real label space)

## The goal
You caught that the understanding-app promises the brain picks only from **your own
routine prompts** ("your known set… autopilot can only ever send one of these"), but
the built classifier (`PromptClassifier.cs`) actually used a **hardcoded list of 7
generic prompts** and never touched the discovery output. Close that gap: make the
**discovered/mined routine set the classifier's actual label space**, so the build
matches the design.

## What I'll do
1. **`PromptClassifier`** — drop the hardcoded `Rules`. `Classify(...)` takes a
   `routines` set. Each routine = `{ Label, Triggers[], BaseConfidence }`, where
   - `Label` = the user's reply text mined from history (e.g. "keep it", "deploy"),
   - `Triggers` = significant words from the **assistant messages that preceded that
     reply** (the discovered `SampleContexts`) + the label's own words,
   - `BaseConfidence` from how often it recurs.
   Match the agent's last assistant message against each routine's triggers; best
   content overlap wins. **Empty set or no overlap → escalate** (safe by default).
   Deny-list + threshold fences unchanged.
2. **`AutopilotService`** — build the routine set from `AutopilotDiscoveryService`,
   cache it, refresh periodically (not every 10s tick), pass it into `Classify`.
   Inject discovery into the engine; add to DI.
3. **Honesty pass** — update the understanding-app (and the Routine-prompts tab
   summary) so they describe what's *actually* wired: the label space is
   auto-derived from your recurring replies (custom-prompt matches flagged);
   manual add/edit curation is explicitly the next slice, not built.

## Assumptions
- The keyword/overlap matcher stays a deterministic **stub** (no LLM call yet) — the
  point of this change is the *source* of the label space (your history, not a
  literal), not swapping in the real CLI classifier.
- Thin/weak matches escalating is acceptable (matches the "ambiguity → escalate"
  philosophy).
- Then rebuild + redeploy to live :5099, and you decide keep/rollback after verify.
