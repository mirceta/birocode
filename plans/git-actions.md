# Git tab — uniform position card + inward-sync actions

> **Status (2026-06-12):** Deployed and confirmed. Live on :5099 (hardened
> pipeline, health in 2s; the busy-guard observably working on its first
> live request). Fixture-verified (`verify-git-actions.mjs`, 17/17 — all
> three buttons actually clicked, conflict auto-abort proven) and confirmed
> by the End User. Next increment: other-branches overview (playback
> approved-pending "create it").

## What the user specified

For current branch B, a fixed card — always the same three comparison rows
(no conditional hiding), then three actions:

```
⎇ B
  n ahead · m behind   main
  n ahead · m behind   origin/main
  n ahead · m behind   origin/B
  [ Merge main into branch ] [ Pull main from origin ] [ Pull branch from origin ]
```

All three actions absorb truth inward (merge local main into B; ff local
main from origin; ff B from origin/B). **No push, no rebase, no checkout**
— publishing and history-rewriting stay with Claude in chat (deliberate).

This supersedes the read-only decision in
[git-origin-visibility](git-origin-visibility.md). Its recorded rationale
(button mutations can collide with a mid-run agent) is carried forward as a
GUARD instead: mutations are rejected (409) and buttons greyed while a chat
run is active in the repo (`RunSessionService.IsBusy`).

## Agreed additions

1. **Auto-fetch on tab open** (background; the "origin state as of" stamp
   shows freshness). Visibility-return reloads stay cheap (no fetch).
2. **Buttons never leave a mess**: pulls are `--ff-only`; merge requires a
   clean working tree and AUTO-ABORTS on conflict ("ask Claude in chat") —
   a phone tap must never strand a conflicted tree.
3. **Self-disabling buttons**: each is enabled only when its row says
   there is something to do (and not busy, and tree clean for merge).
4. **On main the card collapses** to one row (vs origin/main) and one
   button (Pull main).

## Implementation

- `GitService`: `MergeBase` (clean-tree check → `git merge --no-edit
  <localBase>` → on failure `merge --abort` + conflict error),
  `PullCurrent` (`git pull --ff-only`, "diverged"/"not published" errors).
  `PullBase` reused as-is for Pull main.
- `GitController`: `POST /api/git/merge-base`, `POST /api/git/pull-current`
  (both 409 when the repo's chat run is busy); `busy` added to
  `GET /api/git/status`.
- `Git.jsx`: card rework (uniform rows from the existing status fields),
  mount loads with `fetch=true`, buttons + result/error line, busy/dirty
  hints. `gitActions: 'advanced'` capability. i18n en/tr.

## Verification

`verify-git-actions.mjs` on :5201 with a THROWAWAY repo (file:// origin)
manufactured so all three rows have non-zero behinds — every button is
ACTUALLY CLICKED and its row's behind-count drops to 0; then a conflict is
manufactured and Merge must error AND leave the tree clean (auto-abort
proven). Fixture registered via the projects API, registry entry + dirs
removed in finally. Screenshot read before claiming success.
