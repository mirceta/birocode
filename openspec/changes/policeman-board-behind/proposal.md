# The policeman catches "board BEHIND reality" — unrecorded merged/pushed work is discovered

## Why

The board-integrity machinery looks UPWARD only: a column AHEAD of the verified
facts is dishonest (kanban-board-integrity), a silent assignee is stuck. The
opposite direction is a blind spot the Operator just hit (2026-09-16, fleet task
d59ba7f1): task afed9d6d sat in `doing` while its work was PR #113, MERGED into
main — because the arch never relayed a PR link, the verifier had nothing to
follow, and the policeman's PR trace could not match the PR to the card (no
recorded PR, no recorded branch on the card, the PR text never names the card,
the titles differ). The board silently lied "in progress" about finished,
merged work.

The harness KNEW the branch all along: the dispatch branch watch (openspec
arch-branch-handover) records, per dispatched task, the branch the assignee
created — `assignments/<repoId>.json` → `TaskBranches[taskId]`. That knowledge
never reached the trace.

## What Changes

- **The trace consults the dispatch-recorded task branch.** `IAgentDirectory`
  gains `RecordedTaskBranches(sourceId, repoId)` (task id → branch; local repos
  from the assignments store, a peer's are its own → empty), and `PrTrace`
  gains a matching rule: a PR whose head is the branch the harness recorded for
  that task at dispatch traces to that card — same confidence as a branch
  recorded on the card. The discovered PR/branch is auto-linked
  (`RecordClaim`), and the EXISTING forward-only auto-advance moves the card.
  No second verifier.
- **A distinct "board behind reality" signal.** A traced entry whose PR is
  MERGED while the card records nothing is journaled and shown as "board was
  behind reality — unrecorded merged work", distinct from the ahead-of-reality
  (dishonest) signal. When a merged PR is discovered but CANNOT be linked (the
  card's assignees don't include the listing repo), the card is flagged 🆘
  "board behind reality — …" by the policeman instead of being skipped
  silently; the flag clears itself once the card is linked or advances.
- **Existing detections unchanged**: column-ahead-of-facts (dishonest) and
  stuck keep their exact rules and reasons.

## Impact

- Affected specs: `task-graph` (ADDED requirement; composes with the
  one-policeman trace and board-check-provenance journal, both in flight).
- Affected code: `IAgentDirectory` + `ArchAgentService.Directory`, `PrTrace`,
  `PolicemanSweep`, `PolicemanJournal.Traced` (+`Behind`, additive),
  Policeman tab traced rows, `policemanLoop.js` explainer text.
- Regression test reproducing the afed9d6d/#113 case: card in `doing`, no
  link recorded, dispatch-recorded branch merged as a PR → discovered, linked,
  advanced by the verifier — not left silently in `doing`.
