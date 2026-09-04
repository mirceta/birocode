# Remove the deny-word fence

## Why

The deny-list (`deploy, push, force, reset --hard, delete, drop, prod, overwrite,
merge`) was a word filter over prompt and reply text: it escalated a suggestion-loop
routine whose label contained a term, stopped a driven loop whose reply mentioned
one, and refused an arch-agent send whose task text contained one. It matched
words, not intent: on 2026-09-03 it blocked an arch task because the text said
"do **not** … delete any file", and then blocked a branch-hygiene task the
operator had explicitly ordered because it said "push". Each hit cost a full
re-arm cycle. Meanwhile the actions the words stand for are guarded by real
gates: main is protected on GitHub and merged by hand, deploys run through
swap.ps1 with a 15-minute auto-rollback behind "keep it", and every agent
already runs under this repo's "warn before destructive" convention with its own
judgment. The operator does not use the suggestion loop — the one lane where a
regex was the last line of defence — and decided on 2026-09-03 to remove the
fence outright.

## What changes

1. **Server** — no deny list anywhere: `AutopilotConfigStore` loses `DenyList`
   (and its forced defaults), `LoopConfigStore` loses the per-arm `DenyList`,
   the driven-loop ladder no longer stops on a reply word, the classifiers
   (stub + CLI) no longer escalate a routine on a word, the arch agent's
   `send_task` and the fleet peer send no longer refuse on a word. The loop
   arm API stops accepting `denyList`; state and detail responses stop
   reporting it. `Verdict.Denied` and `ContainsWholeWord` go with it.
2. **Client** — the "Always escalates" strip, the per-arm deny chips (console
   Queue tab and the dock loop control), the deny step in the explainer's
   simulator and architecture map, and the prose that described the fence.
3. **Docs** — the loop-driven-agent convention and the event-feed contract no
   longer describe a deny fence.
4. **Specs** — the deny-list requirements are REMOVED from `autopilot-loops`;
   the arch-agent send requirement and the explainer simulator lose their deny
   clauses (MODIFIED).

## What does NOT change

The ladder still stops on operator stop, run error, `NEEDS_HUMAN:`, the
sentinel/verification rules, and the iteration cap. The arch agent's sends are
still gated by the arm, the cap, availability, the fleet opt-ins and the audit
log. The operator gate, kill switch and confidence threshold are untouched.
Old `autopilot.json` / `loops.json` files that still carry a `DenyList` key
load fine — the key is ignored.

## Impact

`ClaudeWeb.App/Services/Autopilot/{AutopilotConfigStore,LoopConfigStore,ILoop,PromptClassifier,CliPromptClassifier,SuggestionLoop,AutopilotService,QueueLoop}.cs`,
`ClaudeWeb.App/Services/Arch/{ArchAgentService,ArchLoop,FleetClient}.cs`,
`ClaudeWeb.App/Controllers/AutopilotController.cs`, the autopilot console and
dock loop control components, i18n, `docs/loop-driven-agent-convention.md`,
`docs/event-feed-contract.md`, tests (`AdvanceQueueLoopTests`,
`GoalLoopFooterOptInTests` replacing `GoalLoopDenylistUiTests`).
