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
- The toggle swaps the **system-specific built-in prompts** — kickoff and
  write-understanding-first — between their **OpenSpec** wording (start an OpenSpec
  change, write to `proposal.md`) and the **legacy** wording (add a `plan.md` entry,
  write `understanding.md`).
- The selected system is remembered **per repository**, so a repo still on the old
  system keeps the legacy prompts until it ports.
- The user's own **saved prompts and prompt plans are unaffected** — they show under
  both tabs.
- Default for a repo with no stored choice: **OpenSpec** (the canonical convention).

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
