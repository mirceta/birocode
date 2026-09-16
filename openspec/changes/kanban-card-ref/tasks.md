## 1. Build

- [x] 1.1 `TaskGraphService`: `ShortId` / `CardRef` / `ResolveTaskRef` (exact id, `task …`,
      `#…`, unique prefix ≥ 6; ambiguous refused with candidates).
- [x] 1.2 Arch tools: `update_task`, `assign_task`, `dispatch_task` resolve references;
      `create_task` `dependsOn` too; `list_tasks` carries `ref`; catalogue says so.
- [x] 1.3 Board routes: PATCH / assign / dispatch resolve references.
- [x] 1.4 Kanban: `#ref` + copy button on every card (stops propagation, `draggable=false`,
      "✓ copied" feedback, clipboard fallback); the detail view's id line gets the button.
- [x] 1.5 Tests: `TaskBoardTests` card-reference facts.

## 2. Verify

- [x] 2.1 .NET + client suites green; isolated :5200 instance: every card shows its `#ref`;
      the copy button puts `task <id>` on the clipboard, shows "✓ copied", does not open
      the card; the detail button works; PATCH by `#ref` updates that exact card;
      screenshot for the PR.
      DONE 2026-09-07 09:14 — .NET 417 pass (2 new card-reference facts in
      `TaskBoardTests`); detached run `verify-card-ref.mjs` → `@@CARDREF@@ pass:true, 20
      checks` (log `.claudeweb-preview/out-card-ref.log`, stamp 2026-09-07T09-13-43):
      8-char #ref on every card, clipboard = `task <full id>`, "✓ copied" then back to ⧉,
      card not opened by the copy, copied reference resolves through PATCH, detail button
      copies the same and keeps the card open, PATCH by `#ref` hits the exact card, the
      catalogue names the #ref; screenshot `docs/screenshots/kanban-card-ref.png`.

## 3. Ship

- [ ] 3.1 Commit on `feature/kanban-card-ref`, push, open the PR with the screenshot
      (task 5cc3e90094a74b9da7f85067ae3f24ab); merge and deploy on the Operator's word.
