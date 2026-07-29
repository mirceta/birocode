# fix-suggestion-loop-inert — proposal

## Why

The 💡 suggestion loop does nothing observable when armed. Verified live on
2026-07-28: the user armed it on this repo in drive mode (19:57:25), watched
three engine ticks produce no send, no pending prompt, and no visible state,
and disarmed (19:57:54). A second suggestion loop (web-flow-autodev) has been
armed and "looping" for a day while its repo folder no longer exists — the
engine silently skips it every tick. The feature is effectively dead on
arrival, in four stacked ways:

1. **The classifier can practically never fire.** Every routine's base
   confidence is exactly 0.85 (live-verified) because the mining enrichment
   only applies when a custom prompt's normalized text *equals* a mined
   routine key — never true for the user's long multi-sentence prompts. With
   threshold 0.75, a proposal needs ≥ 88% match strength, i.e. the agent's
   reply must contain the trigger quota of the *prompt's own wording*. That
   essentially never happens, so every tick ends in an escalate-hold.
2. **Holds are invisible where the user armed.** The decision and its reason
   ("below threshold 0.42 < 0.75", "no routine matched") surface only in the
   Advanced Autopilot console; the dock — where arming happens — shows just
   the armed badge. Armed-but-holding is indistinguishable from broken.
3. **The deny-list censors whole prompts by substring.** It matches anywhere
   in the full prompt text, so "…merge to master…" inside the
   "Close a finished feature" prompt permanently escalates that routine even
   on a confident match.
4. **Loops on missing repos are silently skipped.** `Tick()` iterates only
   repos whose folder exists; an armed loop on a moved/deleted repo gets no
   state, no log, no resolution — it just never does anything, forever.

## What Changes

- **Suggest mode always surfaces the best candidate.** In suggest mode the
  suggestion kind records the top-scoring routine as the pending prompt with
  its confidence even below the threshold (the threshold keeps gating
  drive-mode sends and is unchanged as a safety fence — a human still sends
  every suggest-mode prompt). An armed 💡 loop therefore visibly *does
  something* on the very next new agent message.
- **The dock shows the loop's live decision.** The loop popover (and badge
  tooltip) renders the engine's current decision + reason for the armed
  instance — held / escalated / suggested / sent and why — under the same
  operator-gate disclosure rules as the pending prompt.
- **Deny-list matches are word-scoped and label-aware.** A deny term blocks a
  routine only when it appears as a whole word in the prompt text; the
  escalate reason names the matched term so the user can see why a routine
  never fires and fix their list.
- **A loop on a missing repo resolves instead of being skipped.** The engine
  resolves the instance as `error` with reason `repo-missing`, so the dock
  shows a terminal state instead of an eternally-armed no-op. (Fixes the live
  web-flow-autodev zombie.)
- **Slice 2 (flagged, behind the same gate): a real classifier.** Swap the
  stub word-overlap brain for a one-shot Claude CLI classification call
  (fast/cheap model) that picks a routine from the user's library or
  abstains, keeping the existing `{label, confidence} → gate` contract, the
  per-message dedup that bounds call volume, and the stub as fallback on CLI
  error. This is what makes *drive-mode* suggestion sends actually reachable.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `autopilot-loops`: the suggestion kind's suggest-mode proposal rule (always
  pend the best candidate, threshold gates only drive sends), engine handling
  of missing repos (resolve, don't skip), deny-list matching scope, and the
  dock's disclosure of the live decision + reason.

## Impact

- `ClaudeWeb.App/Services/Autopilot/AutopilotService.cs` — Tick's
  `Where(r => r.Exists)` skip; surfacing decision state for the dock.
- `ClaudeWeb.App/Services/Autopilot/SuggestionLoop.cs` — below-threshold
  best-candidate proposal in suggest mode.
- `ClaudeWeb.App/Services/Autopilot/PromptClassifier.cs` — deny-list scoping;
  near-miss (best candidate + confidence) in the verdict; slice 2 CLI brain
  behind the existing contract.
- `ClaudeWeb.App/Controllers/AutopilotController.cs` — expose the live
  decision/reason in the loop projections under existing gate rules.
- `client/src/components/dashboard/DockLoopControl.jsx` + i18n + CSS — live
  decision readout; pending chip already exists.
- Live data cleanup: the still-armed suggestion loop on the deleted
  web-flow-autodev repo resolves itself on first tick after deploy.
- Docs/understanding-app honesty pass for the changed semantics.
