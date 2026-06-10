# Git main compare — where is the current branch relative to main/master

> **Status (2026-06-11):** Implemented and browser-verified on an isolated
> preview instance on :5201
> (`.claudeweb-preview/playwright/verify-git-main-compare.mjs`, 5/5 checks,
> incl. one real-repo end-to-end check). Not yet deployed to :5099.

## Problem

The Git tab shows the branch's position vs its *upstream* (origin copy of the
same branch), but not vs the repo's main line. When working on a feature
branch the End User also wants to know: how far ahead of `main`/`master` is
this branch, and is it missing commits from it?

## Scope

Backend (`GitService` / `GitController`):

- Detect the base branch: prefer local `main`, then local `master`, then
  `origin/main`, then `origin/master` (verified via `git rev-parse --verify
  --quiet`). No base or detached HEAD → no comparison.
- When the current branch is not the base branch, run
  `git rev-list --left-right --count <base>...HEAD` → behind/ahead counts.
- `StatusResult` gains `BaseBranch` (string|null), `BaseAhead`, `BaseBehind`;
  `GET /api/git/status` response gains `baseBranch`, `baseAhead`,
  `baseBehind`. `baseBranch` is null when on the base branch itself, when no
  main/master exists, or when the comparison fails.

Frontend (`pages/Git.jsx`):

- Below the upstream sync line, when `baseBranch` is set show an explicit
  second line (same spelled-out wording convention as the origin sync —
  no arrows): "N commits ahead of main", "N commits behind main (merge
  needed)", or "in sync with main".
- i18n: `git.baseAhead(/One)`, `git.baseBehind(/One)`, `git.baseInSync`
  (en/tr), interpolating `{n}` and `{base}`.

## Out of scope

- Configurable base branch; merge/rebase actions (agent does those via chat).
