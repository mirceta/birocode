# Organize Custom Prompts — tasks

(Scope revised 2026-07-15: fixed catalog + categories + grid; the old groups/reorder
task list is superseded.)

## 1. Catalog constants

- [x] 1.1 `client/src/components/chat/promptCatalog.js`: `CATEGORIES` (5 fixed) +
      `CATALOG` (17 entries: 7 existing built-ins re-homed with categories + 10 promoted
      customs, verbatim texts, `sys`/`gen` kinds, `aliases` on `understandingapp`) +
      `normalizeText()` dedupe helper
- [x] 1.2 i18n `en.json` + `tr.json`: label + text keys for the 10 promoted prompts
      (texts stay English in both locales, labels translated in tr), 5 category titles +
      "New ideas" section title

## 2. Pop-up UI

- [x] 2.1 `PromptManager.jsx`: replace flat list with category sections (catalog order),
      each a card grid; `sys` entries keep the planning-system text swap; params caption
      computed for all items (catalog templates open the fill form via the existing
      `use()` path)
- [x] 2.2 Hide store customs whose normalized text matches any catalog text
      (base/legacy/aliases); survivors render in the final "New ideas" section with
      Edit/Delete + the unchanged add/edit form
- [x] 2.3 `chat.css`: category headers, responsive card grid, wider Prompts-tab modal,
      phone-first sizing

## 3. Verify

- [x] 3.1 `npm --prefix client run build` clean; Playwright on an isolated preview port:
      5 category sections + New ideas render; 17 catalog cards; the 15 promoted store
      customs are hidden (no duplicate rows); a catalog template card opens the fill
      form; adding a fresh custom shows it under New ideas (then delete it)
- [x] 3.2 System toggle still swaps `sys` texts (spot-check close/evaluate cards under
      "Old system")
- [x] 3.3 `openspec validate organize-custom-prompts --strict` passes
- [x] 3.4 Understanding app updated to the catalog/categories/inbox model
