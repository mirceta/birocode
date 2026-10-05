## ADDED Requirements

### Requirement: Recurring-task tools

The arch agent's tool catalogue SHALL include `list_recurring`, `recurring_runs`,
`create_recurring`, `update_recurring` and `delete_recurring`, operating on the same
recurring-card store the Management App's Recurring tab uses, in the catalogue's result shape
(`ok`, `status`, `detail`, `data`), audited per call, and limited to agents the arch manages.
The role prompt SHALL teach both card kinds (prompt-driven and tracking-only) and that the arch
creates, edits or deletes a card only on the Operator's ask.

#### Scenario: Unmanaged agent

- **WHEN** the arch calls `create_recurring` for an agent outside its scope
- **THEN** the call is refused as `unmanaged` and nothing is stored
