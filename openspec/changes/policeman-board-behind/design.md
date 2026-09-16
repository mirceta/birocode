# Design — policeman-board-behind

## Context

Two facts make the fix small:

1. The policeman's trace (one-policeman) already lists each relevant repo's PRs
   on GitHub and links any PR it can trace to a card sitting behind it; the
   verifier (kanban-lifecycle-columns / board-verify-remote) already advances a
   linked card forward-only. The ONLY gap is discovery: `PrTrace` matches on
   what the CARD records (PR, branch, #ref in the PR text, title containment)
   and nothing else.
2. The harness separately records, per dispatched task, the branch the assignee
   created (`ArchClaims.Assignment.TaskBranches`, written by the dispatch
   branch watch `RecordDispatchedTaskBranches` so the repo is not claimed by
   its own task branch). This is exactly the missing key: in the afed9d6d/#113
   incident the card recorded nothing, but `TaskBranches[afed9d6d] =
   feature/kanban-agent-tabs` and PR #113's head was that branch.

So: hand the trace the recorded task branches, and the existing machinery does
the rest. No new verifier, no new poller, no new probe.

## Decisions

- **`IAgentDirectory.RecordedTaskBranches(sourceId, repoId)`** — the policeman
  keeps depending on the interface, never on the arch service. Local repos read
  the assignments store; a peer's assignments are its own (its policeman runs
  there), so peers return empty. Read failures return empty — discovery is
  best-effort, never a pass-killer.
- **A `PrTrace` rule at branch confidence (strength 3).** "The harness recorded
  branch X for this task at dispatch" is the harness's own knowledge, as
  trustworthy as a branch recorded on the card; it slots beside rule 2, above
  #ref (2) and title (1) matches. The rule keys on the card's own task id, so
  it can't cross cards; the existing tie rule (same strength twice = no match,
  say so, don't guess) still governs.
- **`Behind` on the journal's `Traced` record** (additive, default false — old
  journal JSON deserializes unchanged): true when the discovered PR is MERGED,
  i.e. the dangerous "finished work shown as in progress" case. The Policeman
  tab renders it as "board was behind reality — unrecorded merged work". An
  OPEN PR discovery keeps today's neutral traced row (the card was behind, but
  the ordinary kind the trace has always fixed).
- **The unlinkable case flags instead of skipping.** Today a traced PR whose
  card has assignees but none on the listing repo is skipped silently. When
  that PR is MERGED the sweep now remembers it (card id → why, in-memory beside
  the against-counter) and `ReasonFor` yields "board behind reality — PR #N is
  merged (url) but the card records nothing …", raised through the same
  `Flag()` path as every other sweep flag. The memory is dropped — and the
  flag therefore self-clears — once the card records a PR link or reaches
  pr-merged; a linked discovery drops it immediately.
- **Order of reasons unchanged**: an attention-window observation still wins,
  then column-ahead-of-facts, then behind-reality — one flag per card, the
  existing invariants (never touch another actor's flag) untouched.

## The regression (pinned in PolicemanSweepTests)

Card "M/W two-window GUI…" in `doing`, dispatched, nothing recorded; the fake
directory reports `TaskBranches[card] = feature/kanban-agent-tabs`; GitHub
lists PR #113 MERGED, head `feature/kanban-agent-tabs`, title unrelated, body
without the card ref. One `Trace` pass links the PR (Behind = true), one
`BoardVerifier.VerifyOnce` advances the card `doing → pr-merged`. The same
suite pins: without the recorded task branch the trace finds nothing (the
blind spot existed), the unlinkable merged discovery raises the 🆘 and clears
on linkage, and over-claim + stuck reasons are byte-identical to before.
