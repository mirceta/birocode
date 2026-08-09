# Design: update-close-feature-prompt

## Context

The built-in prompt catalog is a fixed, version-controlled set: entries live in
`client/src/components/chat/promptCatalog.js` and their texts in the i18n files
(`client/src/i18n/en.json`, `client/src/i18n/tr.json`). The close-feature prompt is the
`close` catalog entry (kind `sys`, so it swaps between `prompts.builtin.close` and
`prompts.builtin.close.legacy` per the repo's planning-system toggle). Both locale files
carry the same English body for this key today. Main is protected (no direct pushes, no
agent-side merges), so the current "merge to main" wording is dead advice.

## Goals / Non-Goals

**Goals:**
- Ship the operator-approved new wording for the OpenSpec variant of the close prompt.
- Keep both locale files in lockstep for this key (same English text, matching the
  existing convention for prompt bodies).

**Non-Goals:**
- No change to the legacy variant, the label, the catalog structure, categories, or any
  other prompt.
- No backend or UI-behavior changes; no new toggle logic.

## Decisions

- **Pure i18n string edit.** The catalog already points at the key; changing the two JSON
  values is the entire implementation. No alternative considered seriously — introducing
  a new key or catalog entry would churn the toggle wiring for zero benefit.
- **Exact text.** The new body is the wording the operator provided verbatim (backticks
  around commands kept, as the current string already uses them):

  > it works. First, if there is anything left to commit, commit it now in logical commits (explicit paths, no `git add -A`). Tick the remaining items in the change's tasks.md, run `openspec validate <change> --strict`, then `openspec archive <change>` to fold its delta into the living baseline, and commit the archive. Do NOT merge to main. Instead, merge main into this branch (`git fetch origin` then merge `origin/main`), resolve any conflicts, and verify everything still works after the merge — build and check there are no conflicts left behind. Then create a pull request for this branch (or, if a PR already exists, update it and comment that it is now ready for code review). Once the PR is created/updated, switch this working copy back to the main branch — do not merge the PR, just `git checkout main` locally and leave the merge to me.

- **No `{{name}}` placeholders.** The text contains none, so the card keeps direct-insert
  behavior; nothing in the template machinery is touched. (`<change>` in the text is
  angle-bracket prose for the agent, not a template parameter — same as today.)

## Risks / Trade-offs

- [JSON escaping] The body is a single-line JSON string; a stray unescaped quote would
  break the locale file → verified by the client build (`npm --prefix client run build`),
  which parses the JSON.
- [Store-dupe hiding] The pop-up hides custom prompts whose text matches a catalog
  prompt. Changing the catalog text could resurface an old hidden store copy matching the
  *previous* wording → acceptable; the operator can delete such a "New ideas" entry, and
  no data is lost.
