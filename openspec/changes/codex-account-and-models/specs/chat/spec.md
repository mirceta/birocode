# chat — delta for codex-account-and-models

## ADDED Requirements

### Requirement: The model picker spans both engines and stays coupled to the repo's engine

The chat composer's model picker SHALL offer two engine families — Anthropic (Claude) and
OpenAI (Codex) — where the Codex family is the set of model slugs the logged-in account may
actually run (from `GET /api/codex-usage` `models`), falling back to the CLI's default model
when that is unavailable, so the picker never offers a model that the CLI rejects at turn
time. Choosing a model SHALL imply its engine: selecting an OpenAI model SHALL set the
repository's provider to `codex` and selecting a Claude model SHALL set it to `claude`
(the same per-repo provider the dock's Engine selector sets, via `POST
/api/repos/{id}/provider`), so the picker and the Engine selector always agree. The model a
repository actually receives SHALL be the stored choice when it belongs to that repo's
engine family (or to no known family), else that engine's default; and a chat turn SHALL
ignore a model from the other engine's family, running the CLI with its default instead of
failing. A model id's family SHALL be recognised as: `claude-*` → claude; `gpt-*`,
`codex*`, `o3*`/`o4*` → codex; anything else → unknown.

#### Scenario: Picking an OpenAI model runs the repo agent on Codex

- **WHEN** the operator picks an OpenAI model for a repo whose engine was claude
- **THEN** the repo's provider becomes codex and the next turn spawns `codex exec` with that model

#### Scenario: A stored Claude choice on a codex repo shows the codex default

- **WHEN** the composer opens on a codex repo while the device's stored model is a Claude id
- **THEN** the picker shows that engine's default codex model, and a send carries a codex model, never the Claude id

#### Scenario: A mismatched model is dropped, not fatal

- **WHEN** a turn is sent to the codex engine carrying a `claude-*` model
- **THEN** the harness drops the model and runs codex with its default, and the turn completes
