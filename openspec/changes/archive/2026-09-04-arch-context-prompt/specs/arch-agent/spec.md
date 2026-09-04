## ADDED Requirements

### Requirement: The arch conversation is discoverable by any agent via a copyable prompt

The Arch tab SHALL offer a one-click "Copy agent prompt" action that places on the
clipboard a self-contained prompt telling any agent on this machine how to read the
arch agent's conversation: the current arch session id, the transcript's absolute
on-disk path (readable without credentials), and the harness API routes
(`/api/arch/messages`, `/api/arch/tool-calls`, `/api/arch`) as a fallback. The
prompt SHALL NOT contain the harness access code; it SHALL instruct the reader to
obtain it from the operator. `GET /api/arch` SHALL expose the transcript path as
`session.transcriptPath` (null before the arch agent has ever been armed).

#### Scenario: Operator hands the arch conversation to a repo agent

- **WHEN** the operator clicks "Copy agent prompt" on the Arch tab and pastes the result into any repo agent's chat
- **THEN** that agent can locate and read the live arch conversation from the transcript path alone, with no prior knowledge of the harness and no credentials

#### Scenario: No password in the clipboard

- **WHEN** the prompt is copied
- **THEN** it contains the API routes and the header name but not the access code itself
