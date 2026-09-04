## 1. Server: record the last prompt per dock tab

- [x] 1.1 Add `long? LastPromptAt` (Unix ms) to `DockTab` in `Services/Dock/DockRegistry.cs`; include it in `Clone`, and expose it as `lastPromptAt` in `DockController.ToDto` (read-only — ignore it on PATCH)
- [x] 1.2 Add `DockRegistry.MarkPromptedForRepo(string repoId, long atMs)` that stamps every tab of the repo (visible or hidden) and saves; returns how many tabs were stamped
- [x] 1.3 Add a `RunStarted` event (`RunStartedEvent(RepoId, Lane, SessionId)`) to `RunSessionService`, raised from `TryBeginRun` once the slot is claimed, with the same isolated-invocation / never-throws contract as `RunCompleted`
- [x] 1.4 Subscribe in `DockUnseenResultTrigger` (or a sibling hosted service in `Services/Dock`): on a **builder**-lane start, call `MarkPromptedForRepo(repoId, now)`; log at Info like the unseen latch
- [x] 1.5 `dotnet build` passes; a manual smoke (send a prompt, `GET /api/dock`) shows `lastPromptAt` set on that repo's tabs and untouched on others

## 2. Frontend: `recent` filter state

- [x] 2.1 In `DockToolbar.jsx`, add `RECENT_MS` (5 h) and extend the filter state to `'all' | 'main' | 'feature' | 'running' | 'recent'`; `matchesFilter` returns `!!tab.lastPromptAt && now - tab.lastPromptAt < RECENT_MS` for `recent`, after the existing grid-visible / important exemptions
- [x] 2.2 Add the **recent** segment (glyph `◷`, aria-hidden) with i18n `dashboard.dockFilterRecent` ("recent") and `dashboard.dockFilterRecentTitle` ("prompted in the last 5 hours") in `en.json` + `tr.json`
- [x] 2.3 Update the component header comment: the recent state, its server-owned source (`lastPromptAt`), the 5 h constant, and that aging happens on the poll re-render

## 3. Frontend: emphasize running / unseen tabs

- [x] 3.1 In the tab render, add `dash__docktab--emphasized` when `isRunning(tab) || isUnseen(tab)` (same helpers as the dot and the `running` filter)
- [x] 3.2 In `dashboard.css`, scale the emphasized pill ~1.5×: font, branch row, dot (and unseen badge + glyph), padding, gap, star, max-width; keep the strip's `align-items: center` so mixed sizes share one row
- [x] 3.3 Header comment: emphasis is size-only, applies in every filter state, and reuses the dot classification

## 4. Verify

- [x] 4.1 `npm --prefix client run build` and `dotnet build` pass
- [x] 4.2 Browser-verify per `docs/claude-web/browser-testing.md`: with tabs prompted <5 h ago, >5 h ago (or never), grid-visible, and important — **recent** renders exactly the recently prompted hidden tabs plus the exempt ones; +N counts the rest; grid and persisted `dashboard` flags never change while switching
- [x] 4.3 Browser-verify a hidden dock prompted via the dashboard appears under **recent** on the next roster refresh without a reload, and that the view still holds after a page reload (server-persisted)
- [x] 4.4 Browser-verify emphasis: a running tab and a `!` tab render ~1.5× the size of their neighbours in **All**, **recent** and **running**; the emphasis drops when the run ends / the dock is shown; click behaviour is unchanged
- [x] 4.5 Browser-verify the inherited contract on the new state: reload resets to All; reorder mode shows the full roster with the control disabled and reapplies **recent** on exit
- [x] 4.6 `openspec validate dock-recent-tab-emphasis --strict` passes

---
Status: deployed to live (:5099) via swap.ps1 on 2026-09-02 and user-verified; rollback disarmed with keep.ps1.
