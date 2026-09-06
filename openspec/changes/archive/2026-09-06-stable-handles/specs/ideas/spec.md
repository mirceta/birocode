## ADDED Requirements

### Requirement: Idea handles

Every idea SHALL carry a running number, shown as `#N` in the Ideas list and on task
cards promoted from it, allocated on creation and never changed; ideas that predate
numbers SHALL be numbered once, in creation order.

#### Scenario: A new idea

- **WHEN** an idea is added
- **THEN** it receives the next free number and shows it as `#N` beside its text

#### Scenario: Backfill

- **WHEN** a store without numbers is loaded
- **THEN** every idea gets a number in creation order, persisted, and a later load keeps
  them
