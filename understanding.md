# Understanding — dock git actions

## Goal
Bring the **Git tab's sync buttons into each agent dock's git row** on the
dashboard. Today a dock shows a read-only git status line (branch · ahead/behind);
to actually merge or pull main for that agent you have to open its Git tab. The
feature lets you do it right there in the dock.

## What I'll do
- Add action buttons — **merge main**, **pull main**, **pull branch** — to the
  `.phone__git` row in `client/src/components/dashboard/PinnedAgent.jsx`.
- Wire each to the **existing** endpoints (`/git/merge-base`, `/git/pull-base`,
  `/git/pull-current`), scoped to **that dock's repo** via `apiPost(path, body,
  { repoId })` → `X-Repo-Id` (the same mechanism the dashboard already uses for
  per-dock `/git/status`, and that `Agents.jsx` already uses for `pull-base`).
- Reuse the Git tab's `act()` flow: disable while acting, **respect the `busy`
  guard** (grey out while a chat run is mutating that repo), refresh the dock's
  status when done, surface errors.

## Assumptions / decisions to confirm with you
- **Push is special.** It *publishes*. I lean toward **inward-sync only** (merge/
  pull) for the first slice and either deferring **push** or putting it behind a
  confirm — a dashboard of one-tap push buttons is easy to fire by accident. Tell
  me if you want push in from the start.
- New actions default to **Advanced** mode (per CLAUDE.md), unless you want them
  for Basic too.
- No backend changes — this reuses `GitController` and the per-repo scoping that
  already exists.

## Status — built (inward-sync only)
Done on `feature/dock-git-actions`:
- Extracted the eligibility logic to `client/src/components/git/gitActions.js`
  (`deriveGitActions` + `pullMainPath`); `Git.jsx` now reuses it (no drift).
- Wired **merge / pull main / pull branch** into `PinnedAgent.jsx`'s git row,
  scoped per-dock via `apiPost(path, undefined, { repoId: tab.repoId })`,
  reusing the Git tab's act flow; refreshes the dock's status on completion.
- Gated behind a new `dockGitActions` (Advanced) flag; added i18n (en + tr) and
  compact dashboard CSS. **Push deferred** (publishes — stays in the Git tab).
- Frontend builds clean. **Live browser verification still pending** (needs the
  harness running with a dock on a feature branch). Plan: `plans/dock-git-actions.md`.
