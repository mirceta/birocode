# Projects tab — in-app project management

> **Status (2026-06-11):** Deployed to the live :5099 harness (v1 + v2
> folder picker) and confirmed by the End User. Browser-verified beforehand
> on an isolated :5201 preview
> (`.claudeweb-preview/playwright/verify-projects-tab.mjs`, 15/15 checks).
> **2026-06-11 follow-up (branch `feature/projects-basic-mode`):** promoted
> `projectsTab` to `'basic'` in the capability map at End User request, so
> Basic mode shows the Projects tab and header chip too. Deployed to the
> live :5099 harness and confirmed by the End User (verified beforehand on
> the :5201 preview, `verify-projects-basic.mjs`, 8/8 checks).
> **2026-06-13:** the v2 "New project" form (chips + create-on-missing) is
> superseded by [projects-folder-picker.md](projects-folder-picker.md).

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
   - "New project" form (v2 folder picker): a plain **folder name inside the
     Projects Root** + optional display name. The Projects Root is the parent
     folder of the pinned self repo (e.g. `...\playground`) — new projects
     can only live there. Existing unregistered playground folders are shown
     as tappable chips; a name that doesn't exist yet is **created by the
     harness**. Duplicates return the existing entry. Registered at runtime
     via the existing `RepositoryRegistry.Add` (already persists and is
     thread-safe) — **no restart needed**.
2. **Header dropdown removed.** The header now shows the current project name
   as a chip that links to the Projects tab. `RepoSelector.jsx` deleted; the
   `repoSelector` capability key becomes `projectsTab` (Advanced).

Scope: add + select only. No rename/remove from the web UI (registry supports
them; can be exposed later if asked).

## How

- Backend: `RepoController` gains
  - `GET /api/repos/folders` → `{ root, folders: [{ name, registered }] }` —
    subfolders of the Projects Root (dot-folders hidden);
  - `POST /api/repos` `{ folder, name? }` → resolves `root\folder`, creates
    the directory when missing, then `RepositoryRegistry.Add` →
    `{ id, name, path, exists, isGitRepo, isSelf, created }`. Plain names
    only: separators, `..` and invalid filename chars are rejected (400).
- Frontend: `pages/Projects.jsx` + `projects.css`; route + bottom-nav entry
  (icon "P"); header chip in `Layout.jsx`; i18n keys `projects.*` in en/tr.
- Selection still flows through `RepoContext.selectRepo` (localStorage +
  X-Repo-Id), unchanged.

## Verification

`.claudeweb-preview/playwright/verify-projects-tab.mjs` on an isolated :5201
preview: tab lists projects, selecting one updates `claudeweb_repo` and the
header chip, the folder label shows the playground root, tapping a chip fills
the input, adding a non-existent folder creates it on disk and registers +
selects it without restart, and an invalid folder name shows the server error.
NOTE: the preview shares `%APPDATA%\ClaudeWeb\repositories.json` and the real
playground with the live harness — the test's registry entry and created
folder must be removed after the run.
