## ADDED Requirements

### Requirement: The policeman is a module of its own, shaped like the idea
The policeman SHALL be implemented as its own module with one class per concern — identity,
tool policy (the one rule behind the three fences), the prompt as ordered steps, pure lifecycle
rules, the lifecycle service, and the tools service — depending on the arch only through
narrow interfaces (a conversation host and an agent directory). The arch SHALL drive add-on
conversations through a hook interface (engine tick, after-turn, decorate-send, quiet floor)
and SHALL carry no policeman-specific member beyond the CLI fence. Behaviour SHALL be unchanged
by the split.

#### Scenario: Adding a second standing conversation
- **WHEN** a developer adds another standing management conversation
- **THEN** it is one class implementing the hook interface, registered as a hook, with no edit to the arch service

#### Scenario: Reading one concern
- **WHEN** a developer opens the lifecycle class
- **THEN** every state and transition of the policeman conversation is in that one file, its pure rules beside it, and nothing about tools or prompt text is in it
