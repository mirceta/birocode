## 1. Backend

- [x] 1.1 RepoSubagentStore + keys; RepoSubagentService; SubagentsController.
- [x] 1.2 Engine hooks (session, no-session send, writer wait + decoration, resolved, run config).
- [x] 1.3 One-writer guards in ChatController and the arch's StartRepoTurn.

## 2. Tools and guidance

- [x] 2.1 Six repo-agent MCP tools, `&sub=` identity, the preamble paragraph.
- [x] 2.2 docs/goal-conversations-convention.md (a harness_help topic).

## 3. UI and fleet

- [x] 3.1 SubagentsPanel / GoalPlanPanel owner model; the dock's ⑂ Goal conversations lane with badge, start form, transcript.
- [x] 3.2 Fleet Status + describe counts; peer / fleet goal conversation reads; the Status chip; the Management block; bundles rebuilt.

## 3b. The Operator's review

- [x] 3b.1 Main-conversation pointer (store, tracker, ResumedFrom), the readers switched with no newest-file guess, the picker marks.
- [x] 3b.2 `concurrent` writers (tool, lane form, boundaries text, the lock skips them).
- [x] 3b.3 The "goal conversation" terminology everywhere an agent or the Operator reads (tools, lane, API, data file, summary tag, doc), with the pre-rename state migrated.
- [x] 3b.4 The selected goal conversation's four lanes, as the arch's: Chat · Tools · History · Loops (`/tools`, `/tool-calls`, `/loop`; the History payload shared with the arch).

## 4. Verify

- [x] 4.1 xunit RepoSubagentTests; node subagentOwner tests.
- [x] 4.2 Real end-to-end on an isolated harness (18/18 → 21/21 with the pointer), screenshots.
- [x] 4.3 loop-eval scenario `goal conversations` (21 assertions): FAILED 5 on the pre-fix build, PASS 21/21 twice after the fixes.

## 5. Ship

- [ ] 5.1 Operator review; then a PR, merge and deploy on the Operator's word.
