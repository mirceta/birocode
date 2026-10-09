# Opus 5.5 in the model picker, and the model as a free-text id

## Why

The Operator (2026-10-09, fleet task 28278f6c): adding each new model release
to the repo-agent chat's picker takes a harness task and a fleet redeploy. Two
asks: put Claude Opus 5.5 in the catalogue now, and make the model a FREE-TEXT
field beside the combo box so the next release never needs either.

## What Changes

- `claude-opus-5-5` ("Opus 5.5") joins the Claude group, newest-first: after
  the Mythos-class Fables, before the 4.x line. Display names match the
  existing style.
- The picker gains a **Custom** group: the device's recently used free-text
  ids (newest first, deduped, capped at 6) plus "Custom model id…", which
  reveals a text input. The typed id is validated for SHAPE only (non-empty,
  one word, printable ASCII) — the provider is the judge; a rejected id
  surfaces as the turn's own visible error in the chat (the server already
  passes unknown-family ids through: `AgentProviders.ModelBelongsTo`). The id
  is used and persisted exactly like a picked one, shown as the picker's
  current value (a value the catalogue does not know renders as-is), and
  re-pickable from the recent list.
- One component, every mount: the repo-agent chat composer and the ARCH
  model setting render the same `ModelSelector`, so both get Opus 5.5 and
  free-text. The arch's default stays `claude-fable-5-1` and its server-side
  rule (any `claude-*` id accepted, non-Claude refused with the banner) is
  untouched. Everything else that meets a model id (`prettyModel`,
  `effectiveModelFor`, Status/plan displays) already shows unknown ids as-is.

## Impact

- Affected specs: `chat` (ADDED requirement).
- Affected code: `models.js` (+catalogue entry, `isValidModelId`,
  `rememberCustomModel`), `ModelSelector.jsx`, chat.css, i18n. No server
  change.
- Verified on this machine with the real CLI: `claude --model
  claude-opus-5-5 -p` answered (after the CLI update the old version's error
  itself demanded); a bogus id fails with a visible
  `unrecognized_model` error — the exact message the chat surfaces.
