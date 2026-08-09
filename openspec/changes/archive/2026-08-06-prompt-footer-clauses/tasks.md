# Tasks: prompt-footer-clauses

## 1. Backend clause store

- [x] 1.1 Add `FooterClausesService` (`ClaudeWeb.App/Services/Prompts/FooterClausesService.cs`): `Clause(Id, Text, Active)` records persisted to `%APPDATA%\ClaudeWeb\footer-clauses.json` with the PromptsService atomic temp+rename write and never-reseed-on-unreadable load guard; List/Add/Update/Delete (Update covers text and Active)
- [x] 1.2 Add `FooterClausesController` exposing list/add/update/delete endpoints, following `PromptsController`; register the service in DI
- [x] 1.3 Backend build passes (isolated self-dev build dir, never the running app's bin)

## 2. Frontend state + send path

- [x] 2.1 Add `FooterClausesContext` (`client/src/context/FooterClausesContext.jsx`) mirroring `PromptsContext`: load list, add/update/delete/toggle, refetch on popup open; mount its provider alongside PromptsProvider
- [x] 2.2 Add the shared footer-builder constant + helper (delimiter line, active clauses in list order) and append it in `ChatContext.sendTo` when ≥1 clause is active — after the attachment suffix, so all composer sends (typed + approved queue chips) carry it and no-active-clause sends go out unchanged
- [x] 2.3 Unit-test the footer builder (active-only, list order, empty → unchanged text) if a client test harness exists; otherwise verify via 5.x — no client test harness (vite only), covered by 5.x

## 3. Popup UI

- [x] 3.1 Add `FooterClausesModal` component (portal to `<body>`, PromptManager pattern): clause list with per-clause checkbox, inline edit, delete, and an add-clause row
- [x] 3.2 Wire the new composer button into `ChatInput.jsx` left cluster next to ⚙/⛶; active state renders accent + active-count badge
- [x] 3.3 Gate the button as `'advanced'` in `UiModeContext.jsx`; add all strings to `client/src/i18n/en.json`
- [x] 3.4 Frontend build passes (`npm --prefix client run build`)

## 4. Spec hygiene

- [x] 4.1 `openspec validate --strict` passes for the change

## 5. Verification (docs/claude-web/browser-testing.md — headless browser, not curl)

- [x] 5.1 Isolated preview per self-dev rules; in a dock composer: add a clause, tick it, send a message — agent-received prompt (and bubble) shows typed text + delimited footer (`.preview-test/footer-clauses-check.mjs`, POST /api/chat body captured via route interception)
- [x] 5.2 Untick the clause, send again — prompt goes out exactly as typed; clause still listed inactive; button badge reflects active count in both states
- [x] 5.3 Restart the harness (or reload from a second client) — clause list and active flags persist (`.preview-test/footer-clauses-persist-check.mjs` after a real exe restart)
