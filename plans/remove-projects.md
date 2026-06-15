# Remove projects

> **Status (2026-06-15):** Proposed — branch `feature/remove-projects`.
> Not built yet.

## Goal

The Projects tab (`Projects.jsx`, plans/projects-tab.md) already lets the End
User **add** a project (register a repo folder with the harness). Give it the
mirror: **remove** a project from the existing ones — unregister it from the
harness so it drops out of the selector / Projects list.

**Scope:** removing a project only *unregisters* it (drops the entry from
`repositories.json`). It does **not** delete the folder from disk — same
asymmetry as add, which can register a pre-existing folder. The confirm copy
must say this plainly.

## What already exists (so this is small)

- `RepositoryRegistry.Remove(string id)` — removes the entry, persists
  `repositories.json`, and **refuses to remove the pinned self repo**
  (`IsSelf == true`). Returns `bool`. (`Services/Repositories/RepositoryRegistry.cs`)
- `RepoContext.reloadRepos()` self-heals the active selection: if the stored
  `claudeweb_repo` id is no longer in the list, it switches to the first
  remaining repo (or empty). So removing the *active* project leaves a valid
  selection automatically. (`context/RepoContext.jsx`)
- `apiDelete(path)` client helper, and an existing delete UX to mirror in
  `Guests.jsx` (confirm dialog → `apiDelete` → reload, with a per-row removing
  state). `DockController` / `IpFilterController` show the `[HttpDelete("{id}")]`
  controller shape.

## Plan

**Backend**
- `RepoController`: add `DELETE /api/repos/{id}` → `registry.Remove(id)`;
  `Ok({ removed: true })` or `NotFound`. The self-repo guard lives in the
  registry, so a delete of the self repo returns false → 404/forbidden (decide
  which; 404-style `{ removed: false }` is simplest and matches Dock).

**Frontend (`Projects.jsx`)**
- A **Remove** control on each project card, **hidden for the self repo**.
- Click → confirm dialog (`window.confirm` with an i18n message that states the
  folder is kept on disk; mention if it's the currently-active project).
- On confirm: `apiDelete('/repos/{id}')` → `reloadRepos()`; per-card `removing`
  state + `removeError` on failure.

**i18n** — `projects.remove`, `projects.confirmRemove`, `projects.removing`,
`projects.removed`, `projects.removeError` in `en.json` + `tr.json`.

## Open questions / to decide while building

- **Stale dock tabs:** a dock tab keeps `tab.repoId` of a removed repo. Decide
  whether to close such tabs (or clear the ref) on remove, or rely on the
  existing self-heal. Check `DockContext` behavior when a tab's repo is gone.
- **Confirm UX:** native `window.confirm` (matches `Guests.jsx`) vs. the
  `RestoreConfirm` modal. Lean native for slice 1.
- **Basic vs Advanced:** should remove be Advanced-only (like the visibility
  toggle), or available in Basic too? Default: available in both, since adding
  is.

## Verification

Browser-verify on an isolated `:5210` instance (Playwright): register a throwaway
project via the API, remove it through the UI, assert it disappears and the
active selection stays valid; assert the self repo has no Remove control. The
test **must restore `repositories.json`** (shared with the live harness) and
clean up any folder/entry it created.
