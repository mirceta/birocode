# Git tab — branch "PR preview" (what a pull request would show)

> Editing this plan? First read [doc principles](doc-principles.md).
> Builds on the shipped Git-tab suite — reuse, don't duplicate:
> [origin visibility](git-origin-visibility.md), [actions](git-actions.md),
> [branches](git-branches.md), [history graph](git-graph.md).

> **Status (2026-06-14):** Slices 1 & 2 BUILT on `feature/git-pr-preview`,
> verified locally (self-dev deploy, headless browser). Not yet merged to main /
> deployed to prod. Slice 3 (diff colour / copy / open-on-GitHub) not started.

## Problem

The Git tab today shows the **working-tree** state (`git status`: staged /
changed / untracked) plus ahead/behind position rows and a history graph. What
it does NOT show is the thing you'd look at before merging a feature branch:
**the committed delta of the branch vs the base** — where it branched off, the
commits made since, and the cumulative file diff. That's exactly the summary a
GitHub **pull request** gives. Today you'd have to drop to a terminal and run
`git log main..HEAD` / `git diff main...HEAD`.

## Goal

When the checked-out branch is a **feature branch** (not the base itself), add a
read-only "Branch review" section that answers:
1. **Base & divergence** — which branch this would merge into, and the
   merge-base commit it diverged at.
2. **Commits** — the list of commits unique to this branch (`base..HEAD`).
3. **Changed files** — the cumulative three-dot diff (`base...HEAD`): per-file
   add/delete line counts, with the full patch available on demand.

This is explicitly distinct from the existing working-tree `git status` view.

## Design

### Base selection (what we PR against)
Reuse `DetectBases()`. Prefer the **origin base** (`origin/main` /
`origin/master`) when present — that mirrors what GitHub diffs against — else
fall back to the local base. If HEAD *is* the base branch, the section is
hidden (nothing to review).

### Two-dot vs three-dot (deliberate)
- **Commit list:** `git log <base>..HEAD` — commits on HEAD not in base.
- **File diff:** `git diff <base>...HEAD` (three-dot, i.e. from the merge-base)
  — the branch's own changes, ignoring commits added to base afterward. This is
  what a PR's "Files changed" tab shows, so it stays stable even if base moves.
- **Merge-base hash:** `git merge-base <base> HEAD`.

### Backend (reuse `RunGit`, add to `GitService`/`GitController`)
- `GET /api/git/review` (feature-gated): returns
  `{ isFeatureBranch, base, baseRef, mergeBase, commits[], files[], truncated }`
  where:
  - `commits[]` = `{ short, subject, author, date }` from
    `git log <base>..HEAD --format=…` (reuse the graph format conventions; cap N).
  - `files[]` = parsed `git diff --numstat <base>...HEAD` →
    `{ path, added, deleted, status }` (+ rename old→new). Cheap, no patch bytes.
- `GET /api/git/review/file?path=…` (feature-gated): returns the unified patch
  for ONE file (`git diff <base>...HEAD -- <path>`), fetched lazily on expand,
  so a 10k-line diff never ships up front. Bound the size; mark `truncated`.
- All read-only → no busy-guard needed (unlike the action endpoints). Keep the
  `[GIT]` log tag.

### Frontend (`client/src/pages/Git.jsx` + new sub-component)
- New collapsible **"Branch review"** section under the position rows, rendered
  only when `isFeatureBranch`. Header: `feature/x → origin/main` + merge-base
  short hash + "N commits, M files".
- Commit list (short hash, subject, relative date) and a changed-files list
  (path + green/red +/- counts, like a PR). Clicking a file lazy-loads its
  patch via `/review/file` and renders it (reuse/extend any existing diff/pre
  styling; syntax-plain is fine for v1).
- Feature gate: new capability key (e.g. `gitBranchReview`) in
  `client/src/context/UiModeContext.jsx`, **Advanced by default** (CLAUDE.md
  UI-modes). i18n strings (en/tr).

## Slices
1. **Summary** — `/api/git/review` (base, merge-base, commits, numstat files) +
   the collapsible section showing commits + changed-file list with counts. No
   patches yet. (Delivers the core "PR overview".)
2. **Per-file patch** — `/api/git/review/file` + lazy expand to view a file's
   diff inline.
3. (Maybe later) basic diff syntax/colour, copy-as-`git diff`, or a one-click
   "open PR on GitHub" via `gh` — separate plan if pursued.

## Out of scope
- Opening/managing real GitHub PRs, review comments, approvals, CI status.
- Editing/staging from this view (it's read-only, like the rest of the tab).

## Verification
- Backend: on a feature branch with a couple of commits, `/api/git/review`
  returns the right base, merge-base, commit list and numstat; on `main` it
  returns `isFeatureBranch:false`. Compare against real `git log/ diff` output.
- Frontend: headless-browser check (per docs/claude-web/browser-testing.md) —
  the section appears only on a feature branch, lists the commits/files, and
  lazy-loads a file patch on click. Confirm it's hidden in Basic mode.
