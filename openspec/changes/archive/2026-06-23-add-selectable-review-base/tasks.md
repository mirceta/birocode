# Tasks

## 1. Backend — base resolution + validation

- [x] 1.1 In `GitService.cs`, add a ref-validation helper (reject empty / leading `-` /
      whitespace / `..` / control chars; confirm with `git rev-parse --verify --quiet
      <ref>^{commit}`).
- [x] 1.2 Give `Review` and `ReviewFileDiff` an optional `string? baseOverride`: when valid
      use it, else fall back to `DetectBases()`. `ReviewResult.base`/`.baseRef` reflect what
      was actually used.
- [x] 1.3 Add `ListReviewBases(workingDir)` returning the auto-detect default plus local
      heads and `origin/*` (excluding `origin/HEAD`), via `git for-each-ref`.

## 2. Backend — endpoints

- [x] 2.1 `GET /api/git/review` and `GET /api/git/review/file` read optional `?base=` and
      pass it through; an explicit-but-invalid base returns 400 `unknown base branch`.
- [x] 2.2 Add `GET /api/git/review/bases` returning `{ default, bases:[{ref,kind}] }`; add its
      response DTO.

## 3. Frontend — picker

- [x] 3.1 In `BranchReview.jsx`, fetch `/git/review/bases` once per repo; render a base
      dropdown in the review header, pre-selecting the persisted base if still present else
      the server `default`.
- [x] 3.2 Thread the selected base into `/git/review?base=` and `/git/review/file?path=&base=`;
      on base change, clear the expanded per-file patch cache and refetch the summary.
- [x] 3.3 Persist the selection per repo in `localStorage` (`claudeweb_reviewBase_<repoId>`).
- [x] 3.4 Add i18n strings (picker label + aria) and dropdown styles to the Git/BranchReview CSS.

## 4. Verify + ship

- [x] 4.1 `npm --prefix client run build` clean.
- [x] 4.2 Browser-verify on an isolated preview port (Playwright, per
      `docs/claude-web/browser-testing.md`) against a repo with ≥2 plausible bases: default
      base loads, switching the dropdown changes the commit/file set and the "into <base>"
      header, an expanded file's patch reflects the new base, and the choice survives reload.
      (`.claudeweb-preview/playwright/check-review-base-picker.mjs`)
- [x] 4.3 Confirm the no-`base` URLs still behave exactly as before (back-compat), and an
      invalid `?base=` returns 400.
- [x] 4.4 Deploy to live `:5099` via `swap.ps1` and re-verify.
