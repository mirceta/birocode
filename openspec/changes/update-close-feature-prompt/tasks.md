## 1. Implementation

- [x] 1.1 Replace the `prompts.builtin.close` value in `client/src/i18n/en.json` with the new PR-based wording from design.md (leave `.label` and `.legacy` untouched)
- [x] 1.2 Apply the identical value to `prompts.builtin.close` in `client/src/i18n/tr.json`

## 2. Verify

- [x] 2.1 Build the frontend (`npm --prefix client run build`) — proves both locale JSONs still parse
- [x] 2.2 Playwright check on an isolated port: open the prompts pop-up, Use the "Close a finished feature" card, assert the composer draft contains the new text (e.g. "Do NOT merge to main") and not "merge to main and make sure"
- [x] 2.3 `openspec validate update-close-feature-prompt --strict`
