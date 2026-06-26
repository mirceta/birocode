# Tasks

## 1. Hide the self repo from the Basic project list

- [x] 1.1 In `client/src/pages/Projects.jsx` (line 127), `visibleRepos` now excludes `isSelf`
      in Basic: `isAdvanced ? repos : repos.filter(r => r.visibility === 'basic' && !r.isSelf)`.
- [x] 1.2 Advanced unchanged — `isAdvanced ? repos` lists every repo; remove button still hidden
      for self via `!r.isSelf`; self stays pinned at index 0.

## 2. Never resolve a Basic user's active repo to the self repo

- [x] 2.1 `client/src/context/RepoContext.jsx` now imports `useUiMode` and resolves the active
      selection against a mode-aware `selectable` set (`repos` in Advanced; in Basic
      `visibility === 'basic' && !isSelf`). When `currentRepoId` isn't selectable it falls back
      to the first selectable repo, else `''` (empty state). Replaces the old `load()` self-heal.
- [x] 2.2 The resolution lives in a `useEffect` keyed on `[repos, isAdvanced, loading,
      currentRepoId, selectRepo]`, so toggling Advanced → Basic re-resolves off the self repo
      immediately (not just on initial load).

## 3. Keep the harness/self conversation out of Basic

- [x] 3.1 `dualChat` stays `'advanced'` so `view` is never `'harness'` in Basic. Added a guard in
      `client/src/context/ChatContext.jsx`: `if (!isAdvanced) view = 'project'`, so a Basic user's
      chat is always the project-following conversation scoped to `currentRepoId` (kept non-self by
      task 2) — a stale self-repo dock tab can't drive it either.
- [x] 3.2 With currentRepoId guaranteed non-self in Basic, switching projects renders the new
      project's conversation, never the ClaudeWeb self conversation (the reported bug). Frontend
      build green (`npm --prefix client run build`).

## 4. Verify (headless browser)

Driven by `.preview-test/selfrepo-basic-check.mjs`: serves the real built `client/dist` with
SPA fallback, mocks `/api/*` with fixtures (self[basic] + kekik[basic] + notes[advanced]), and
exercises the actual RepoContext/Projects/ChatContext code. **14/14 passed.**

- [x] 4.1 Basic + multi: list shows only `kekik` (self and advanced-only `notes` hidden);
      active repo resolved to `kekik` despite a stored `self` selection; the chat (`/studio`)
      scoped its repo-id to `kekik`, never `self`. (A1–A5)
- [x] 4.2 Advanced + multi: all three repos listed; self is the active project. (B1–B3)
- [x] 4.3 Toggle Advanced → Basic via the real header ModeToggle: self disappears from the list
      and the active project reactively re-resolves from `self` to `kekik`. (D1–D3)
- [x] 4.4 Basic + self-only harness: no project cards, the real `projects.noneBasic` empty state
      renders, and the chat does not scope to `self`. (C1–C3)
- [x] 4.5 No page errors in Basic. (Advanced multi-pane needs a wide viewport + extra mocked
      endpoints; tested at phone width — the End User case — where Advanced renders cleanly.)

## 5. Understanding app (if warranted)

- [ ] 5.1 If the mode → repo-filter → default-resolution → conversation-render flow is worth
      visualizing, author/refresh `understanding-app/index.html` (build-less, relative URLs)
      per `docs/understanding-app-convention.md`; otherwise note why prose + verification suffice.
