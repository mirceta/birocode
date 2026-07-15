# chat — delta spec

## ADDED Requirements

### Requirement: A chat session scoped to the Projects Root

The chat system SHALL support a session whose working scope is the Projects Root
(the `arch` context) rather than a registered Repo, using the same send, stream
(SSE attach/reattach by seq), stop, and resume machinery as repo-scoped sessions.
The `arch` context SHALL be resolved explicitly: it SHALL never be served by the
unknown-repo fallback, and resolution of unknown repo ids other than `arch` SHALL
be unchanged.

#### Scenario: Arch turn over the existing protocol

- **WHEN** a prompt is sent addressed to the `arch` context
- **THEN** the run executes at the Projects Root and the client streams, reattaches, and stops it with the same endpoints and semantics as a repo session

#### Scenario: Unknown repo ids behave as before

- **WHEN** a chat request carries an unknown repo id that is not `arch`
- **THEN** resolution behaves exactly as it does today
