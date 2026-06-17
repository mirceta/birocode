# Dock git actions — sync buttons in each agent dock's git row

> **Status (2026-06-17):** Built (inward-sync only — push deferred). Frontend
> compiles clean; live browser verification still pending. On
> `feature/dock-git-actions`.
>
> **Decisions taken during build:**
> - **Push: deferred.** Slice 1 is inward-sync only (merge / pull main / pull
>   branch). Push publishes and is too easy to mis-tap on a wall of docks — it
>   stays a deliberate Git-tab action.
> - **Always-show-but-disable**, mirroring the Git tab: the three buttons render
>   whenever the dock has git state, disabled when not actionable (and hidden
>   only when on the base branch, where merge/pull-branch are meaningless).
> - **Gated by `dockGitActions` feature flag** (Advanced), separate from the Git
>   tab's `gitActions` so the surfaces can be toggled independently.
> - **Eligibility logic extracted** to `client/src/components/git/gitActions.js`
>   (`deriveGitActions` + `pullMainPath`) and reused by both `Git.jsx` and
>   `PinnedAgent.jsx`, so the two surfaces can't drift.

## What the user asked for

The Git tab already has the inward-sync action buttons (**merge main**, **pull
main**, **pull branch**, **push**). Each agent dock on the dashboard already
shows a read-only git status row (`.phone__git` → `GitStatusSummary`). The ask:
**put those same action buttons in the dock's git row**, so you can merge/pull
main for an agent's repo straight from the dashboard, without opening that
agent's Git tab.

## Why this is mostly a frontend job

The hard parts already exist and are reused as-is:

- **Endpoints** (`GitController`): `POST /api/git/merge-base`,
  `/api/git/pull-base`, `/api/git/pull-current`, `/api/git/push-current` —
  the exact actions the Git tab fires.
- **Per-repo scoping** is already wired: the dashboard fetches each dock's
  status with `apiGet('/git/status', { repoId })`, and `apiPost(path, body,
  { repoId })` sends `X-Repo-Id` so the backend's `_repos.Current()` resolves to
  *that dock's* repo. `Agents.jsx` already does
  `apiPost('/git/pull-base', {}, { repoId })` — precedent for a per-dock git
  action from a non-Git-tab surface.
- **The busy guard** is already in the `/git/status` payload (`busy === true`
  when a chat run is mutating that repo); actions are server-rejected and the
  buttons grey out, same contract as the Git tab (`plans/git-actions.md`).

So the build is: surface the buttons in `PinnedAgent.jsx`'s git row, wire them to
the existing endpoints with the dock's `repoId`, and reuse the Git tab's `act()`
flow (disable while acting / busy, refresh status on completion, surface errors).

## Scope

- **In:** `merge main`, `pull main`, `pull branch` in each dock's git row, scoped
  to that dock's repo; reuse `GitStatusSummary`; respect `busy`; refresh the
  dock's status after an action; compact, dashboard-appropriate layout.
- **Decide during build:** whether **push** belongs here (it *publishes* — the
  Git tab keeps it as a distinct, deliberate action; a dashboard full of one-tap
  push buttons is easier to fire by accident). Lean toward inward-sync only
  (merge/pull) for slice 1, push deferred or behind a confirm.
- **Out (for now):** new endpoints, conflict-resolution UI beyond the existing
  auto-abort, rebase/checkout (publishing/branch-switching stays in the Git tab).

## Open questions

- Which actions show per dock, and are any gated by state (e.g. only show
  "merge main" when the dock is behind base)? Mirror the Git tab's
  show-when-relevant logic vs. always-show-but-disable.
- Advanced-only? The dock git row itself follows the dashboard's mode gating;
  new actions default to Advanced (per CLAUDE.md) unless told otherwise.
- Confirmation: inward-sync is low-risk (ff/auto-abort); push needs a confirm.

## Touch points

- `client/src/components/dashboard/PinnedAgent.jsx` — the `.phone__git` row.
- `client/src/pages/Git.jsx` — source of the `act()` pattern to reuse/extract.
- `client/src/pages/dashboard.css` — compact button styling.
- `client/src/api/client.js` — `apiPost(..., { repoId })` (already supports it).
- Backend unchanged (reuses `GitController` + `X-Repo-Id` scoping).
