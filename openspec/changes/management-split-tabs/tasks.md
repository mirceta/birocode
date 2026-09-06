## 1. Build

- [x] 1.1 `IdeasPanel` `view` prop: `ideas` hides the graph/kanban inner tabs (Break
      into tasks shows its working/done line inline), `graph` / `kanban` render that
      board alone; `TaskGraphPanel` `pollMs`.
- [x] 1.2 Management App: tabs arch · tasks · ideas · graph · kanban · events · status;
      persisted pane order (`manageapp.paneOrder`), ◀ ▶ per pane bar, tab strip follows;
      CSS for the move buttons and the new panes; i18n en + tr.
- [x] 1.3 Rebuild the harness client and the Management App bundle.

## 2. Verify

- [x] 2.1 Detached browser check (`verify-split-tabs.mjs`, `@@SPLITTABS@@`): seven tabs;
      the Ideas tab has only two inner tabs and the composer; the graph and kanban tabs
      render their board alone; side by side: default order, move right/left, hidden pane
      skipped, tab strip follows, order + hidden set survive a reload.
      DONE 2026-09-06 10:36 — `@@SPLITTABS@@ pass:true, 19 checks` (log
      `.claudeweb-preview/out-split-tabs.log`, evidence stamp 2026-09-06T08-36-39).

## 3. Ship

- [ ] 3.1 Deploy with `swap.ps1` and keep on the operator's instruction.
