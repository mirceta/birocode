## ADDED Requirements

### Requirement: The arch agent runs on a pinned Claude model
Every arch turn — the Operator's send and a loop-driven wake alike — SHALL be spawned
with an explicit `--model`, taken from the harness setting `ArchModel` (appsettings.json /
`CLAUDEWEB_ARCHMODEL`), whose default SHALL be `claude-fable-5-1`. A `claude-*` value
SHALL be used as set; a blank value or a model of another engine's family SHALL fall
back to the default. The arch state (`GET /api/arch`) SHALL report the model in use.
Repo agents' models SHALL be unaffected (theirs remain per repo in the registry).

#### Scenario: No setting
- **WHEN** appsettings.json has no `ArchModel` and the Operator sends to the arch
- **THEN** the arch's CLI is spawned with `--model claude-fable-5-1`

#### Scenario: Operator override
- **WHEN** `ArchModel` is `claude-sonnet-4-6`
- **THEN** arch turns carry `--model claude-sonnet-4-6` and `GET /api/arch` reports it

#### Scenario: Foreign model
- **WHEN** `ArchModel` is `gpt-6-astra`
- **THEN** arch turns carry `--model claude-fable-5-1`
