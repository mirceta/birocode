## 1. i18n — legacy prompt variants

- [x] 1.1 Add `feature.kickoffPrompt.legacy` and `understanding.prefillPrompt.legacy` to `en.json` with the old `plan.md` / `understanding.md` wording (the pre-port text).
- [x] 1.2 Mirror both legacy keys in `tr.json` (ASCII-transliterated style, like the existing strings).

## 2. Per-repo planning-system state

- [x] 2.1 Add a helper (`promptSystem.js`) to read/write the per-repo choice in `localStorage` keyed by repo id (default `'openspec'`).
- [x] 2.2 Expose the current repo's selected system to the prompts pop-up (via `useRepo().currentRepoId`).

## 3. Toggle UI in the prompts pop-up

- [x] 3.1 Add an `OpenSpec / Old system` selector to the `PromptManager` header (inside the Advanced-gated pop-up), wired to the per-repo state.
- [x] 3.2 Style it distinct from the Prompts | Plans tabs (`.prompt-mgr__systembar` / `__sysbtn`).

## 4. Built-ins follow the toggle

- [x] 4.1 In the built-in entries, select the OpenSpec vs `.legacy` i18n key based on the active system.
- [x] 4.2 Saved prompts and prompt plans render unchanged under both options (built-ins-only swap; user list untouched by construction).

## 5. Verify

- [ ] 5.1 Browser-verify on an isolated preview: toggle persists per repo, defaults to OpenSpec, both built-ins swap wording, saved prompts/plans unaffected, 0 console errors. (PENDING — needs a preview build / deploy.)
- [x] 5.2 `openspec validate prompt-system-toggle --strict` clean. Client builds clean (`vite build` ✓).
