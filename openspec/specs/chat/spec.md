# Chat

## Purpose

Lets the End User run Claude Code over the opened Repo from the phone-accessible web
UI — send a prompt, stream the reply, and continue the session. This is the Harness's
core job.

## Requirements

### Requirement: Send a prompt and stream the reply

The system SHALL accept a chat prompt for the opened Repo and stream the assistant's
response back over Server-Sent Events as it is produced.

#### Scenario: Basic turn

- **WHEN** the End User submits a prompt to an idle session
- **THEN** the Harness runs the Claude CLI in the Repo and streams the reply over SSE until the turn completes

### Requirement: Resume a session

The system SHALL let a subsequent prompt continue the same Claude session so earlier
context is retained.

#### Scenario: Follow-up turn

- **WHEN** the End User submits a second prompt that depends on earlier context
- **THEN** the Harness resumes the existing session and the reply reflects the prior turns

### Requirement: Stop a running turn

The system SHALL let the End User stop a turn that is still in progress.

#### Scenario: Interrupt

- **WHEN** the End User stops a turn that is still streaming
- **THEN** the Harness terminates the run and the session returns to idle, ready for the next prompt
