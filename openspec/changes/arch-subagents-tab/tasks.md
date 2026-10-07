# Tasks — arch-subagents-tab

## 1. Implementation

- [x] 1.1 `subagents.js` (pure): dot state on the agents' palette, needs-human rule, badge word, title line, attention-first sort, toolbar count
- [x] 1.2 `SubagentsPanel.jsx`: vertical selector + the Arch tab's own conversation view on the right; Stop on busy (stop_arch_goal), per-device hide on finished; 5 s poll
- [x] 1.3 `ManageApp.jsx`: fixed tab strip (arch + subagents), old "arch:<id>" keys migrate to Subagents with the conversation selected, ＋ lands in Subagents, label count polls
- [x] 1.4 `GoalView` += `stopReason` / `stopDetail` / `phase` (additive; store and endpoints untouched)

## 2. Verification

- [x] 2.1 `subagents.test.mjs` in the client suite (dot palette, needs-human, sort, count, truncation)
- [x] 2.2 Evidence rig `shot-arch-subagents.mjs`: before (5 per-goal toolbar tabs) / after — two arch tabs with the count, dot classes per state, the NEEDS_HUMAN question on the row, select renders the conversation, stop/hide placement, hide removes, legacy tab key migrates; 10/10, screenshots committed
- [x] 2.3 Client + backend suites green; bundles rebuilt; openspec validate --strict
