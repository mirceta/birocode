# Proposal: update-close-feature-prompt

## Why

The built-in "Close a finished feature" prompt (`prompts.builtin.close`) still tells the
agent to "merge to main and make sure main is synced with origin" — but since 2026-07-06
the `main` branch is protected (direct pushes rejected, merges reserved for the user), so
the prompt instructs a flow that can no longer work and omits the steps the real close-out
ritual now needs: committing leftovers, archiving the OpenSpec change, merging main *into*
the branch, and opening a PR for the user to merge.

## What Changes

- Replace the OpenSpec-variant text of the built-in close prompt (`prompts.builtin.close`
  in `client/src/i18n/en.json` and `client/src/i18n/tr.json`) with the new PR-based
  wording agreed with the operator:
  - commit any leftovers first, in logical commits with explicit paths (no `git add -A`);
  - tick remaining `tasks.md` items, `openspec validate <change> --strict`, then
    `openspec archive <change>` and commit the archive;
  - explicitly do NOT merge to main — instead merge `origin/main` into the feature branch,
    resolve conflicts, and verify the build still works;
  - create (or update + comment on) a pull request for the branch;
  - check the working copy back out to `main` locally and leave the PR merge to the user.
- The legacy variant (`prompts.builtin.close.legacy`) and the prompt's label stay unchanged.
- No code changes — `promptCatalog.js` already surfaces the key; only the i18n string values
  change (both locale files carry the same English text for this key, as they do today).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `prompts`: the "System-specific built-ins follow the toggle" requirement's OpenSpec
  variant of the close-feature built-in changes meaning — the inserted text must now
  target a PR-based close-out (archive + merge main into branch + open PR + return to
  main) instead of merging to main directly.

## Impact

- `client/src/i18n/en.json` — `prompts.builtin.close` value.
- `client/src/i18n/tr.json` — `prompts.builtin.close` value (same English text, per
  existing convention for this key).
- No backend, API, or catalog-structure changes; no UI behavior changes beyond the
  inserted text. Frontend rebuild required to ship.
