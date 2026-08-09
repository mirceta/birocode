# Tasks: expand-popup-prompt-list

## 1. Frontend

- [x] 1.1 PromptExpandModal: accept `prompts`, `onAddPrompt`, `promptsEnabled` props; render
      the saved-prompts list (emoji/label/text + Insert appends to draft) and the create form
      (label + text → onAddPrompt) below the editor, both gated on `promptsEnabled`
- [x] 1.2 ChatInput: pass `prompts`/`addPrompt` from usePrompts and the `customPrompts`
      capability into PromptExpandModal
- [x] 1.3 chat.css: list + create-form styles inside the popup (scrollable list, editor keeps
      priority); i18n keys in en.json + tr.json

## 2. Verify

- [x] 2.1 `npm --prefix client run build`
- [x] 2.2 Playwright verify-expand-prompts.mjs on an isolated harness port: open a dock
      composer's expand popup → saved prompt listed → Insert appends to the draft →
      create form adds a prompt (visible in list; cleanup deletes it) → screenshot
- [x] 2.3 `openspec validate expand-popup-prompt-list --strict`
