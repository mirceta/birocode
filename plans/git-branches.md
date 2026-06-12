# Git tab — other-branches overview

> **Status (2026-06-12):** Deployed and confirmed, including increment 2
> (push-branch button + dead-branch filter, `verify-git-push.mjs` 9/9 with
> a real push to a bare origin). The filter cut the live overview from 17
> forgotten branches to the 2 with actual unmerged work. Confirmed by the
> End User.

## Problem

The Git tab shows only the checked-out branch. WIP parked on other branches
is invisible — the user forgets what they were doing there.

## Design

Below the current-branch card, an **Other branches** section: one mini-card
per local branch (excluding the checked-out branch and the base branch),
sorted by most recent commit first. Each card uses the SAME three-row
convention as the main card, led by the actual memory aid:

```
⎇ feature/old-idea     "wip: half-finished composer refactor" · 3 days ago
   2 ahead · 5 behind   main
   2 ahead · 8 behind   origin/main
   not published                            (or: n ahead · m behind origin/B)
```

- **No actions** on other branches — the three buttons operate on the
  checked-out branch only; acting on others means checkouts (a different,
  riskier feature, explicitly out of scope).
- Read-only; counts come from the same locally-known origin refs (the tab
  already fetches on open).
- Section hidden when there are no other branches.

## Implementation

1. `GitService.ListBranches` — `git for-each-ref refs/heads` for name,
   committer date, subject; per branch `CountLeftRight` vs local base,
   origin base, and `origin/<branch>` when it exists. Shares base
   detection with `CompareToOriginBase` (extracted `DetectBases`).
2. `GitController`: `GET /api/git/branches` (read-only).
3. `Git.jsx`: section under the file groups; reuses `PositionRow` and the
   chat `friendlyDate` helper. `gitBranchList: 'advanced'` capability.
   i18n en/tr.

## Verification

`verify-git-branches.mjs` on :5201: fixture repo with two extra branches
(one published-and-diverged, one unpublished) — cards render with correct
numbers, subjects, and order; the current branch and main are absent;
real-repo sanity (this repo's stacked feature branches appear). Screenshot
read before claiming success.
