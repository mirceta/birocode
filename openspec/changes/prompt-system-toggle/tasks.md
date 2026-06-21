## 1. i18n — legacy prompt variants

- [ ] 1.1 Add `feature.kickoffPrompt.legacy` and `understanding.prefillPrompt.legacy` to `en.json` with the old `plan.md` / `understanding.md` wording (the pre-port text).
- [ ] 1.2 Mirror both legacy keys in `tr.json` (ASCII-transliterated style, like the existing strings).

## 2. Per-repo planning-system state

- [ ] 2.1 Add a small helper to read/write the per-repo choice in `localStorage` keyed by repo id (default `'openspec'`), mirroring existing per-device prefs.
- [ ] 2.2 Expose the current repo's selected system to the chat/composer components.

## 3. Toggle UI in the prompts pop-up

- [ ] 3.1 Add an `OpenSpec / Old system` segmented control to the `PromptManager` header (Advanced-gated), wired to the per-repo state.
- [ ] 3.2 Style it distinct from the Prompts | Plans tabs so the two axes don't read as one.

## 4. Built-ins follow the toggle

- [ ] 4.1 In the kickoff and write-understanding prefill controls, select the OpenSpec vs `.legacy` i18n key based on the active system.
- [ ] 4.2 Confirm the user's saved prompts and prompt plans render unchanged under both options.

## 5. Verify

- [ ] 5.1 Build the client to an isolated preview port; browser-verify: toggle persists per repo, defaults to OpenSpec, both built-ins swap wording, saved prompts/plans unaffected, 0 console errors.
- [ ] 5.2 `openspec validate prompt-system-toggle --strict` clean.
