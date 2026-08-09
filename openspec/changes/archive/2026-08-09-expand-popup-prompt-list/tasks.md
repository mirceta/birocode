# Tasks: expand-popup-prompt-list

## 1. Frontend (first cut — superseded by amendment)

- [x] 1.1 PromptExpandModal: accept `prompts`, `onAddPrompt`, `promptsEnabled` props; render
      the saved-prompts list (emoji/label/text + Insert appends to draft) and the create form
      (label + text → onAddPrompt) below the editor, both gated on `promptsEnabled`
- [x] 1.2 ChatInput: pass `prompts`/`addPrompt` from usePrompts and the `customPrompts`
      capability into PromptExpandModal
- [x] 1.3 chat.css: list + create-form styles inside the popup (scrollable list, editor keeps
      priority); i18n keys in en.json + tr.json

## 2. Verify (first cut)

- [x] 2.1 `npm --prefix client run build`
- [x] 2.2 Playwright verify-expand-prompts.mjs on an isolated harness port: open a dock
      composer's expand popup → saved prompt listed → Insert appends to the draft →
      create form adds a prompt (visible in list; cleanup deletes it) → screenshot
- [x] 2.3 `openspec validate expand-popup-prompt-list --strict`

## 3. Amendment: list the QUEUE STASH, not the custom-prompts library

- [x] 3.1 PromptExpandModal: props become `stash`/`onAddStash`/`stashEnabled`; render the
      numbered queued-prompts list (Insert appends to draft, never consumes the item) and
      the add-to-queue form (text → onAddStash), gated on `stashEnabled`
- [x] 3.2 ChatInput: pass the surface's `stash` + `addStash(queueTabId, …)` + `stashEnabled`
      into PromptExpandModal (drop the prompts wiring there; ⚙ manager unchanged)
- [x] 3.3 chat.css number badge + form simplification; i18n copy retargeted to the queue
      (en.json + tr.json)

## 4. Verify (amendment)

- [x] 4.1 `npm --prefix client run build`
- [x] 4.2 Playwright verify-expand-prompts.mjs rewritten to the stash flow on an isolated
      harness port: stash a chip → open expand popup → queued prompt listed numbered →
      Insert appends to draft AND the chip stays queued → add-to-queue form appends a new
      chip (visible in list + strip; cleanup removes it) → screenshot
- [x] 4.3 `openspec validate expand-popup-prompt-list --strict`
