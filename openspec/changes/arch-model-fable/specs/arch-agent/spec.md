## ADDED Requirements

### Requirement: The arch agent runs on a Claude model the Operator picks like a repo agent's
Every arch turn — the Operator's send and a loop-driven wake alike — SHALL be spawned
with an explicit `--model`: the model the Operator picked for the arch, default
`claude-fable-5-1`. The Arch tab's composer row SHALL carry the same model picker the
repo agents' docks have; a pick SHALL be posted to `POST /api/arch/model`, kept in the
arch state (one model for every arch conversation) and reported by `GET /api/arch` as
`model`. A `claude-*` pick SHALL be used as set; a blank pick SHALL reset to the default;
a model of another engine's family SHALL be refused and the current model kept. Repo
agents' models SHALL be unaffected (theirs remain per repo in the registry).

#### Scenario: Nothing picked
- **WHEN** no model was ever picked for the arch and the Operator sends to it
- **THEN** the arch's CLI is spawned with `--model claude-fable-5-1` and the picker shows Fable 5.1

#### Scenario: Operator picks another Claude model
- **WHEN** the Operator picks Sonnet 4.6 in the Arch tab's picker
- **THEN** `POST /api/arch/model` stores `claude-sonnet-4-6`, `GET /api/arch` reports it, and the next arch turn carries `--model claude-sonnet-4-6`

#### Scenario: Foreign model
- **WHEN** the Operator picks a Codex model in the Arch tab's picker
- **THEN** the server answers 400 with the model it kept, the picker snaps back to it and the refusal shows as the page's error
