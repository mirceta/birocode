# Git Tab — read-only git status view

> **Status (2026-06-10):** Deployed to the live :5099 harness and confirmed
> by the End User. Browser-verified beforehand on an isolated preview
> instance (`.claudeweb-preview/playwright/verify-git-tab.mjs`; ran on :5201
> because the minesweeper Product legitimately held the :5200 Preview Port).

## Problem

The End User (on the phone) cannot see what state Claude has left the repo
in: which branch is checked out, what is uncommitted, what is unpushed. The
History tab shows commits, but not the live working-tree state.

Decision (user): **read-only** — no commit/push/switch actions; the agent
performs all mutations through chat.

## Design

### Backend

Extends the existing M3 git module (no new module needed):

- `GitService.Status(workingDir)` — runs `git status --porcelain=v2 --branch`
  and parses: branch head, upstream, ahead/behind counts, and the change list
  (staged / unstaged / untracked / conflicted per path).
- `GitController`: new `GET /api/git/status` returning

```json
{
  "branch": "main",
  "upstream": "origin/main",
  "ahead": 1,
  "behind": 0,
  "files": [ { "path": "client/src/App.jsx", "index": "M", "worktree": ".", "untracked": false } ]
}
```

Repo resolution via `RepositoryResolver.Current()` (X-Repo-Id header), same
as the other git endpoints. `[GIT]` log tag.

### Frontend

- `client/src/pages/Git.jsx` + `git.css`: branch header (⎇ name, ahead/behind
  vs upstream), grouped file list (Staged / Changed / Untracked / Conflicts)
  with status letters, and a clean-tree empty state. Refreshes on mount, repo
  change, and visibilitychange; manual refresh button.
- Route `/studio/git` in `App.jsx`; "Git" tab in `BottomNav.jsx`.
- Gated by `useFeature('gitTab')`; `gitTab: 'advanced'` in `UiModeContext.jsx`
  (new-features-default-Advanced convention).
- i18n strings under `git.*` in `en.json` / `tr.json`.

Out of scope (v1): per-file diffs, commit/push/branch actions, dock-tab-aware
repo targeting (uses the global repo selector like Files/History).

## Files touched

| File | Change |
|------|--------|
| `ClaudeWeb.App/Services/Git/GitService.cs` | `Status()` + porcelain v2 parser. |
| `ClaudeWeb.App/Controllers/GitController.cs` | `GET /api/git/status`. |
| `client/src/pages/Git.jsx`, `client/src/pages/git.css` | New page. |
| `client/src/App.jsx` | Route. |
| `client/src/layout/BottomNav.jsx` | Nav tab (Advanced). |
| `client/src/context/UiModeContext.jsx` | `gitTab: 'advanced'`. |
| `client/src/i18n/en.json`, `tr.json` | `git.*`, `nav.git`. |

## Verification

Isolated :5200 (`docs/claude-web/self-dev.md`), Playwright
`verify-git-tab.mjs`: open /studio/git in Advanced mode against the
workspace repo (own pinned dock tab per the shared-dock.json gotcha), assert
branch renders; dirty a file via the API-side repo and assert it appears;
clean it and assert the clean state. Deploy to :5099 only on explicit user OK
(dead-man's-switch routine).
