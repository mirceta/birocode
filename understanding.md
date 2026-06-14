# Understanding — Ideas become global (+ pinned left of the dashboard)

## Decision (the user's call)

Ideas are **global**, not per-project and not per-agent. One **master list**
of ideas, the same everywhere. Keep the **Ideas tab**, but it now shows **all**
ideas (no project scoping). The dashboard's pinned-left panel shows that same
global list. "Ideas live in the root and nowhere else."

This **resolves the open question** (whose ideas → all of them, global) and
**reverses** `plans/ideas-tab.md`'s per-project decision (notes keyed by repo).

## What changes

- **Backend (`NotesService`/`NotesController`):** drop the `repoId` keying.
  `notes.json` goes from `{ repoId → [notes] }` to a single global list.
  `/api/notes` no longer reads `X-Repo-Id`. **Migration:** on load, flatten the
  old per-repo map into one list (merge all projects' notes, sorted by
  createdAt) so nothing is lost.
- **Ideas tab (`pages/Ideas.jsx`):** fetch once (global), not on every
  `currentRepoId` change. Same composer/list UI.
- **Dashboard:** pin the global Ideas down the left (a shared Ideas component
  the tab and the panel both render).

## Flag

Reverses the documented per-project decision in `plans/ideas-tab.md`. The user
chose this knowingly; the plan records it.

## Status — built & verified (4/4 + migration + global API)

Built:
- `NotesService` → single global `Ideas` list; legacy per-repo file migrates
  (flatten by createdAt) + rewrites. `NotesController` drops `X-Repo-Id`.
- Shared `components/ideas/IdeasPanel.jsx` (global fetch); `pages/Ideas.jsx` is
  now a thin wrapper; `ideas.css` moved alongside the component.
- `Dashboard.jsx`: `.dash__body` = pinned-left `.dash__ideas` panel + the grid.
- i18n placeholder de-projected.

Verified on an isolated :5200 instance: migration (old per-repo notes.json →
merged global list, file rewritten), global behavior (added under repo A,
visible under repo B), Ideas tab renders the global list, dashboard pinned-left
panel renders it beside the grid + screenshot. Live :5099 untouched (synthetic
notes.json removed afterward). Next: commit.
