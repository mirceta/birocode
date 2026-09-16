## ADDED Requirements

### Requirement: Every arch conversation keeps its own CLI session
Each arch conversation (the Operator-facing one, every sibling, the policeman) SHALL run in
its own CLI session: a session SHALL belong to at most one conversation. When a
conversation has no session of its own, its next turn — whether an Operator send or a
loop's send — SHALL start a fresh CLI session; the harness SHALL NEVER resolve or pin an
arch conversation's session from the newest transcript in the shared arch home. The
harness SHALL refuse to record, for one conversation, a session that another conversation
owns, and SHALL drop a loop pin that names another conversation's session.

#### Scenario: A loop is armed on a brand-new conversation
- **WHEN** the policeman conversation is created and its recipe loop is armed before it ever had a turn, while the Arch chat has a long session in the same home
- **THEN** the loop's first send starts a new CLI session for the policeman, and the Arch chat's session is untouched

#### Scenario: A turn reports a sibling's session
- **WHEN** a policeman turn completes reporting the session id the Arch chat owns
- **THEN** the harness does not record it for the policeman, drops the loop pin, logs the refusal, and the policeman's next turn starts fresh

### Requirement: Conversations found sharing a session are split
On every engine tick the harness SHALL detect any session shared by two or more arch
conversations and split it: the Operator-facing conversation keeps it (else the oldest);
the others lose their session id and loop pin and start fresh on their next turn. The
detachment SHALL be logged.

#### Scenario: Healing after this fix deploys
- **WHEN** the harness starts with `@arch` and `@arch:policeman` both recording the same session id
- **THEN** the first tick leaves the session on `@arch`, clears it on `@arch:policeman`, and the policeman's next pass runs in a new session
