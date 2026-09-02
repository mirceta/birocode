# Add Fable 5.1 to the model selector

## Why

Anthropic released Claude Fable 5.1 (`claude-fable-5-1`) on 2026-09-01: same
$10/$50 pricing as Fable 5, cache reads 75% cheaper, fewer safeguard
interventions in agentic coding. The harness passes the chat's model string
through verbatim to the CLI (`CliRunnerService`), so the backend already
supports it — only the hardcoded dropdown in `ModelSelector.jsx` needs the
entry. A live smoke test through the installed CLI confirmed the model works
end to end from this box.

## What Changes

- Add `claude-fable-5-1` ("Fable 5.1") to the model dropdown, at the top —
  making it the default for devices with no saved model choice (the existing
  `getModel()` falls back to the first list entry). Fable 5 and the older
  models stay selectable.
- Update the installed Claude Code CLI on the box (npm global) so it
  recognizes the model's metadata (1M context window instead of the 200K
  unknown-model fallback, which would have triggered auto-compaction far too
  early). Done as part of this change: 2.1.252 → 2.1.258.

## Impact

- Affected specs: `chat` (adds a model-selection requirement — the spec did
  not cover the model dropdown yet; seed-and-grow)
- Affected code: `client/src/components/chat/ModelSelector.jsx` (one list
  entry), frontend rebuild + deploy. No backend change.
