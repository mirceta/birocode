# Understanding — Remove projects

## What you asked for

In the **project step** (the Projects tab, where the End User adds projects),
add the ability to **remove a project** from the existing ones — the mirror of
the existing "New project" / add flow.

## What I'll do

- **Backend:** add `DELETE /api/repos/{id}` to `RepoController`. The registry
  already has `RepositoryRegistry.Remove(id)` (it persists `repositories.json`
  and refuses to remove the pinned **self** repo), so the controller just calls
  it and returns `{ removed: true }` / 404.
- **Frontend (`Projects.jsx`):** add a **Remove** control on each project card
  (hidden for the self repo), guarded by a confirm dialog. On confirm:
  `apiDelete('/repos/{id}')` → `reloadRepos()`. `RepoContext.reloadRepos()`
  already auto-switches the active project to the first remaining one if the
  removed repo was active, so no broken selection.
- **i18n:** add `projects.remove` / `confirmRemove` / `removing` / `removed` /
  `removeError` to `en.json` + `tr.json`.

## Assumptions

- **Removing a project only unregisters it from the harness — it does NOT
  delete the folder from disk.** (Matches how add can register an existing
  folder.) I'll make the confirm copy say so explicitly.
- The self repo (Claude Web itself) stays non-removable.
- Dock tabs pointing at a removed repo: I'll check whether stale `tab.repoId`
  references need cleanup, or whether the existing self-heal is enough. Will
  decide during the slice and note it in the plan.
- Browser-verified on an isolated `:5210` instance; the test must restore any
  repositories.json changes (the file is shared with the live harness).
