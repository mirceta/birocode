# Tasks

## 1. Reinstate the editable custom-prompt list

- [x] 1.1 In `PromptManager.jsx`, render the backend custom prompts (from `usePrompts()`)
      alongside the fixed built-ins, each with a Use action and edit/delete affordances.
- [x] 1.2 Confirm the backend spine is reused as-is (`PromptsService.cs`, `PromptsController.cs`,
      `PromptsContext.jsx` CRUD) — no schema change to `Prompt(Id, Emoji, Label, Text)` or
      `prompts.json` (per design Decision 2).

## 2. Template parameter parsing

- [x] 2.1 Add a pure helper that extracts distinct `{{name}}` placeholder names from a body in
      first-appearance order (grammar `[A-Za-z0-9_ -]+`, trimmed, de-duplicated).
      → `client/src/components/chat/promptTemplate.js` `extractParams`.
- [x] 2.2 Add a substitution helper that replaces every `{{name}}` with its provided value
      (verbatim, multi-line, empty allowed). → `fillParams`.
- [x] 2.3 Unit-cover both helpers (no placeholders, repeats, adjacent/edge cases, `${VAR}`
      non-collision) — 10/10 cases pass under Node.

## 3. Parameter-fill form

- [x] 3.1 Build the fill form (portaled/stacked over the pop-up): one labelled free-text field
      per distinct parameter, first-appearance order, first field focused.
- [x] 3.2 Route Use through the choke point: zero parameters → insert verbatim immediately;
      ≥1 parameter → open the form; Confirm substitutes + `insertPrompt(result)`; Cancel inserts
      nothing and leaves the draft unchanged.
- [x] 3.3 Verify insertion appends to an existing draft (reuses `ChatInput.insertPrompt`).

## 4. Authoring affordance

- [x] 4.1 Reinstate the add/edit custom-prompt form (emoji, label, body) wired to
      `addPrompt`/`updatePrompt`/`deletePrompt`.
- [x] 4.2 Show a live read-out of detected parameters beneath the body field (preview only;
      nothing persisted but the body).

## 5. Gate & modes

- [x] 5.1 Confirm the whole feature stays behind `customPrompts: 'advanced'` — the ⚙ button and
      `<PromptManager>` (which now owns the custom list + fill form) only render when
      `useFeature('customPrompts')` is true, so Basic mode shows none of it.

## 6. Understanding app

- [x] 6.1 Overwrite `understanding-app/index.html` with a companion visual of the
      template → parameter-form → substituted-insert flow (live, build-less, relative URLs).

## 7. Verify

- [x] 7.1 Build the frontend (`npm --prefix client run build`) — clean — and exercise the flow
      in a browser (per `docs/claude-web/browser-testing.md`): add a template, Use it, fill
      fields, confirm substituted insert; Use a no-parameter prompt (direct insert); Cancel
      inserts nothing. **Verified live on the deployed `:5099` harness — operator confirmed it works.**
- [x] 7.2 `openspec validate add-prompt-templates --strict` passes.
