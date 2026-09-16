# Tasks — policeman-board-behind

## 1. Discovery

- [x] 1.1 `IAgentDirectory.RecordedTaskBranches(sourceId, repoId)` + arch implementation over the assignments store (local only; peers/failures → empty)
- [x] 1.2 `PrTrace` rule: PR head = the dispatch-recorded task branch → strength-3 match keyed on the card's own id

## 2. Signal

- [x] 2.1 `PolicemanSweep.Trace` passes the recorded branches in; a MERGED discovery is journaled `Behind` and logged "board behind reality"
- [x] 2.2 Unlinkable MERGED discovery → sweep memory + `ReasonFor` → 🆘 "board behind reality — …"; self-clears on linkage or pr-merged
- [x] 2.3 `PolicemanJournal.Traced` gains `Behind` (additive); Policeman tab traced row + `policemanLoop.js` explainer text updated

## 3. Verification

- [x] 3.1 Regression test: the afed9d6d/#113 case — doing + recorded task branch + merged PR → linked (Behind) and advanced by `VerifyOnce`, not left in doing
- [x] 3.2 Tests: blind spot existed without the recorded branch; unlinkable merged discovery flags and clears; over-claim + stuck reasons unchanged
- [x] 3.3 Full backend + client suites green; openspec validate --strict
