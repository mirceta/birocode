# Projects tab — in-app project management

> **Status (2026-06-11):** Deployed to the live :5099 harness and confirmed
> by the End User. Browser-verified beforehand on an isolated :5201 preview
> (`.claudeweb-preview/playwright/verify-projects-tab.mjs`, 12/12 checks:
> list, select via tap, badge/chip updates, runtime add + auto-select,
> bad-path error from the server).

## Why

Today adding a project means hand-editing `%APPDATA%\ClaudeWeb\repositories.json`
(or using the desktop GUI) and restarting the harness. The End User asked for a
way to register a new project from the phone, with no restart.

## ⚠️ Convention change (deliberate, user-approved)

`plans/git-tab.md`-era convention said repositories are **Operator-managed**
(desktop GUI only) and `RepoController` is read-only. This feature moves repo
management to the End User: anyone with the shared password can register any
directory on the host as a project. The user was warned and approved on
2026-06-11.

## What

1. **New "Projects" tab** (`/studio/projects`, Advanced mode):
   - Lists all registered projects: name, path, active marker, badges for
     "missing folder" and "not a git repo".
   - Tapping a project makes it the device's active project (same
     device-local selection as the old dropdown).
   - "New project" form: host path + optional display name. Server validates
     the folder exists; duplicates return the existing entry. Registered at
     runtime via the existing `RepositoryRegistry.Add` (already persists and
     is thread-safe) — **no restart needed**.
2. **Header dropdown removed.** The header now shows the current project name
   as a chip that links to the Projects tab. `RepoSelector.jsx` deleted; the
   `repoSelector` capability key becomes `projectsTab` (Advanced).

Scope: add + select only. No rename/remove from the web UI (registry supports
them; can be exposed later if asked).

## How

- Backend: `RepoController` gains `POST /api/repos` `{ path, name? }` →
  `RepositoryRegistry.Add` → `{ id, name, path, exists, isGitRepo, isSelf }`;
  400 with a message on bad/missing path.
- Frontend: `pages/Projects.jsx` + `projects.css`; route + bottom-nav entry
  (icon "P"); header chip in `Layout.jsx`; i18n keys `projects.*` in en/tr.
- Selection still flows through `RepoContext.selectRepo` (localStorage +
  X-Repo-Id), unchanged.

## Verification

`.claudeweb-preview/playwright/verify-projects-tab.mjs` on an isolated :5201
preview: tab lists projects, selecting one updates `claudeweb_repo` and the
header chip, adding a project with a real temp dir works without restart,
bad path shows the server error.
