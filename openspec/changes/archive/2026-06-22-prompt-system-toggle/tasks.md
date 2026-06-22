## 1. i18n — system variants + hard-coded library

- [x] 1.1 Add `feature.kickoffPrompt.legacy` and `understanding.prefillPrompt.legacy` (en + tr).
- [x] 1.2 Add the rest of the built-in library as i18n keys: close-out, evaluate-options (each with `.legacy`), and the system-agnostic doc-simplify / wall-of-text / understanding-app (en + tr).

## 2. Per-repo planning-system state

- [x] 2.1 `promptSystem.js` — read/write the per-repo choice in `localStorage` (default `'openspec'`).
- [x] 2.2 Read the current repo's system in the pop-up via `useRepo().currentRepoId`.

## 3. Toggle UI in the prompts pop-up

- [x] 3.1 `OpenSpec / Old system` selector in the `PromptManager` header.
- [x] 3.2 Styled distinct from the Prompts | Plans | Notes tabs.

## 4. Hard-code the built-in set + retire the editor

- [x] 4.1 Replace the prompt list with a fixed `BUILTINS` array (sys/gen kinds); each insert-only.
- [x] 4.2 System-specific entries pick OpenSpec vs `.legacy` key by the active system.
- [x] 4.3 Remove the add/edit/delete editor (form, emoji grid, edit/delete buttons, related state). Backend (`PromptsService` / `/api/prompts`) left dormant; Plans + Notes tabs untouched.

## 5. Verify

- [x] 5.1 Browser-verify on a preview: 7 built-ins listed, no editor, toggle swaps the 4 system-specific ones + persists per repo, generic 3 identical, 0 console errors. (Verified on live :5099 deploy.)
- [x] 5.2 `openspec validate prompt-system-toggle --strict` clean; client builds clean.
