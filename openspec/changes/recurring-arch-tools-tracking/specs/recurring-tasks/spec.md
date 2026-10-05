## ADDED Requirements

### Requirement: A tracking-only recurring card

A recurring card SHALL have a kind: `prompt` (the scheduler arms runs, as specified) or
`tracking`. A tracking card SHALL carry a title, one repo agent, a description of the job that
runs inside that agent's own application, and optionally the id of one of the agent's
registered local apps. The scheduler SHALL never send a tracking card anything, hold it, or
record runs for it; it SHALL have no schedule and a manual run SHALL be refused. The
Operator's autopilot gate SHALL NOT apply to a tracking card. Cards written before the kind
existed SHALL read as `prompt`.

#### Scenario: A nightly import that the product runs itself

- **WHEN** a tracking card "Nightly bank-statement import" is created on the birokrat-web agent
  naming its `web` app
- **THEN** the card appears on the board with no next run, the scheduler never looks at the
  agent for it, and Run now answers that the job runs inside the agent's app

### Requirement: One command path for the tab and the arch

Creating, editing, pausing, resuming and deleting a recurring card SHALL go through one
service used by both the Recurring tab's API and the arch agent's tools, with one validation
per kind (prompt: title, agent, instructions, schedule; tracking: title, agent, description)
and one gate rule (a prompt card's create / edit / resume refused while the gate is closed;
pause and delete always allowed; a tracking card never gated). A card's kind SHALL NOT change
after creation.

#### Scenario: The arch and the tab agree

- **WHEN** the arch creates a prompt card while the Operator's gate is closed
- **THEN** it is refused exactly as the tab would refuse it, and nothing is stored

### Requirement: Arch tools for recurring cards

The arch agent SHALL have `list_recurring` (every card on the agents it manages, or one
machine / one agent, in the tab's own projection), `recurring_runs` (one card's run history),
`create_recurring`, `update_recurring` (fields, a new agent, pause / resume) and
`delete_recurring`. The tools SHALL resolve agents like the loop tools, SHALL refuse an agent
the arch does not manage as `unmanaged`, SHALL audit every call, and SHALL carry the same
result shape as the other tools. The role prompt SHALL teach that the arch creates, edits or
deletes a recurring card only when the Operator asks.

#### Scenario: What is scheduled, how did it go

- **WHEN** the Operator asks the arch what is scheduled and how the CI check went
- **THEN** `list_recurring` and `recurring_runs` answer it with the cards, their next runs and
  the last runs' outcomes, with nothing created or changed

#### Scenario: A tracking card from chat

- **WHEN** the Operator says "arch, add a tracking card for the hourly invoice sync on
  razvoj2016/bironext, app sync"
- **THEN** `create_recurring(kind tracking, …)` creates it, the Recurring tab shows it as a
  tracking-only card with Open harness, and the arch reports the card id
