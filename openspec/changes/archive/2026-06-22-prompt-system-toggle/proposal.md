## Why

The two built-in composer prompts — "Kick off a new feature" and "write your
understanding first" — were just retuned to OpenSpec (`openspec new change` /
`proposal.md`). But repositories that haven't ported yet still plan with
`plans/*.md` + `understanding.md`, so for them those prompts now inject the wrong
ritual. During the transition each repo needs the wording that matches the system
it is actually on.

## What Changes

- Add a top-level **OpenSpec / Old system** toggle (two tabs) to the custom-prompts
  ⚙ pop-up.
- **Hard-code the whole one-off prompt library** as a fixed, version-controlled
  built-in set and **retire the editable, JSON-backed list** (remove add/edit/delete;
  the prior saved prompts become built-ins). The `PromptsService` / `/api/prompts`
  backend is left dormant; the **Plans** and **Notes** tabs are untouched.
- The **system-specific** built-ins — kickoff, write-understanding-first, close-a-
  feature, evaluate-options — swap between **OpenSpec** wording (OpenSpec change /
  `proposal.md` / `design.md` / `archive`) and **legacy** wording (`plan.md` entry,
  `understanding.md`, the old close-out). The system-agnostic ones are identical under
  both.
- The selected system is remembered **per repository** (default **OpenSpec**), so a
  repo still on the old system keeps the legacy prompts until it ports.

## Capabilities

### New Capabilities
- `prompts`: the composer prompt presets surface (the ⚙ custom-prompts pop-up) — its
  built-in prompts, the user's saved prompts/plans, and the new per-repo
  planning-system toggle that selects which built-in prompt wording is offered.

### Modified Capabilities
<!-- none — `prompts` is not yet in the baseline; this change seeds it (seed-and-grow). -->

## Impact

- **Client (frontend-only intended):** the ⚙ pop-up (`PromptManager.jsx`), the
  kickoff / understanding prefill controls, and a small per-repo "planning system"
  setting (device-local, keyed by repo id — mirrors existing per-device prefs).
- **i18n (`en.json` + `tr.json`):** add the **legacy** variants of the two built-in
  prompts alongside the existing OpenSpec ones (`feature.kickoffPrompt`,
  `understanding.prefillPrompt`).
- **No new backend** expected; if per-repo persistence must sync across devices, fall
  back to an existing per-repo settings store rather than adding one.
- Advanced-gated like the rest of the ⚙ pop-up (Basic mode unaffected).
