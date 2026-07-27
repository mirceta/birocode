# loop-recipes — delta

## ADDED Requirements

### Requirement: Named reusable loop recipes with seeded defaults

The system SHALL persist a server-side set of named loop recipes — each with an
id, display name, prompt text, sentinel phrase, and iteration cap — shared by
all devices. On first load the set SHALL be seeded with built-in recipes
codifying the feature-delivery ritual, including at least "Drive the feature"
(keep implementing the current OpenSpec change until its tasks are done) and
"Finish and ship" (verify, update docs, commit, open a PR). Recipes SHALL be
editable and deletable, and seeding SHALL never overwrite or resurrect a
user-edited or user-deleted recipe.

#### Scenario: First load seeds the ritual recipes

- **WHEN** the harness starts with no recipe store on disk
- **THEN** the recipe set contains the built-in "Drive the feature" and "Finish and ship" recipes

#### Scenario: Edits survive restarts and reseeding

- **WHEN** the user edits a seeded recipe's prompt and the harness later restarts
- **THEN** the edited text is retained and not overwritten by the seed

### Requirement: Recipes embed the looped-agent output contract visibly

Each recipe's prompt text SHALL include, as visible text, the looped-agent
output contract: end the reply with the sentinel phrase when the whole job is
genuinely done, or with `NEEDS_HUMAN: <question>` when blocked on a decision
only the human can make. The system SHALL NOT inject hidden text at send time —
the prompt shown in the recipe editor is exactly what is sent to the agent.

#### Scenario: What you see is what is sent

- **WHEN** a loop is armed from a recipe
- **THEN** the prompt the agent receives is byte-identical to the recipe's displayed prompt text, including the contract paragraph

### Requirement: Arming from a recipe fills the loop config

The system SHALL let a loop be armed directly from a recipe: selecting a recipe
supplies the loop's prompt, sentinel, and cap (with the cap adjustable at arm
time), so starting a codified loop requires choosing a recipe rather than
composing a prompt from scratch.

#### Scenario: One recipe arms one loop

- **WHEN** the user arms a loop on an agent by picking a recipe
- **THEN** the loop starts with that recipe's prompt, sentinel, and cap without further composition

### Requirement: The convention is documented agent-agnostically

The looped-agent output contract SHALL be stated in a standalone agent-agnostic
document on disk (like the existing understanding-app and local-exposure
convention docs), covering the sentinel and `NEEDS_HUMAN:` markers and the
safety posture, with a pointer from CLAUDE.md. Changes to the convention SHALL
be made in that document.

#### Scenario: Another agent can read the contract off disk

- **WHEN** any agent on the box opens the convention document
- **THEN** it finds the complete output contract (sentinel + needs-human markers and when to emit them) without needing this repo's chat context
