# Make the branch-review base branch selectable

## Why

The Git tab lets the Operator review the current branch's changes as a PR-style diff
(`client/src/pages/BranchReview.jsx` → `GET /api/git/review`). The branch it compares
*against* — the PR "base" — is never chosen by the Operator: the server auto-detects it
in `GitService.DetectBases` (`ClaudeWeb.App/Services/Git/GitService.cs:270`) by trying
`main → master → origin/main → origin/master` and always preferring the origin base. The
same auto-detect runs again per file in `ReviewFileDiff` (`GitService.cs:705`).

That is fine when work branches off `main`, but it is wrong whenever the Operator wants to
review against a different base — a long-lived integration branch, a release branch, the
local `main` vs `origin/main`, or a sibling feature branch a stack is built on. Today there
is no way to express that: the review silently compares to `main` and the Operator cannot
tell it otherwise.

We want the Operator to pick the compare-to (base) branch from a dropdown in the review
header, with the current auto-detected base as the default.

## What Changes

- **Base-branch picker (frontend)** — a dropdown in the `BranchReview` header listing the
  repo's candidate base branches. Selecting one re-runs the review against that base. The
  current auto-detected base remains the default and is pre-selected. The selection is
  remembered per repo on the device (localStorage), like other UI prefs.
- **Candidate-bases endpoint (backend)** — `GET /api/git/review/bases` returns the list of
  branches eligible to compare against (local heads + `origin/*` remotes), with the
  auto-detected default flagged, so the dropdown has a clean, purpose-built source instead
  of reusing the ahead/behind-laden `GET /api/git/branches`.
- **Optional base parameter (backend)** — `GET /api/git/review` and
  `GET /api/git/review/file` accept an optional `base=<ref>` query param. When present and
  valid, the review and per-file patches compute against that ref; when absent (or invalid),
  the server falls back to today's auto-detect, so existing callers are unchanged.
- **Ref validation** — the supplied `base` is verified to exist (`git rev-parse --verify`)
  and rejected if it does not or if it looks like an option (leading `-`), so a chosen base
  can never inject git arguments. An unknown base returns a clear error, not a wrong diff.

## Impact

- **Specs:** `git` — **seeds** this capability (no baseline spec today) with the
  branch-review requirement, including selectable base.
- **Code (backend):** `ClaudeWeb.App/Services/Git/GitService.cs` (`Review` /
  `ReviewFileDiff` take an optional base; a `ListReviewBases` helper; ref validation),
  `ClaudeWeb.App/Controllers/GitController.cs` (base param on the two review routes + a new
  `review/bases` route + DTO).
- **Code (frontend):** `client/src/pages/BranchReview.jsx` (dropdown, selection state +
  per-repo persistence, base threaded into both fetches), its CSS, and the i18n catalog for
  the picker label/strings.
- **Non-goals:** no change to *which commits/files* the diff algorithm shows for a given
  base (still merge-base three-dot); no arbitrary two-ref comparison UI (HEAD stays the
  "top" of the PR); no server-side persistence of the choice; no new diffing of detached
  HEADs or tags — branches only.
