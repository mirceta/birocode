# arch-agent — delta spec

## ADDED Requirements

### Requirement: A standing chat scoped to the Projects Root

The system SHALL provide an Arch Agent chat whose Claude CLI runs execute with the
Projects Root (the parent folder of the pinned self repo) as their working
directory. The scope SHALL be addressed by the reserved context id `arch`, which
SHALL resolve to the Projects Root without being a registered repo: it SHALL NOT
appear in the repo registry file, in `GET /api/repos`, or in any project picker.
If no self repo is pinned (no Projects Root is derivable), a chat request for the
`arch` context SHALL be rejected with an explicit error and SHALL NOT fall back to
any registered repo.

#### Scenario: An arch turn runs at the Projects Root

- **WHEN** the operator sends a prompt to the Arch Agent chat
- **THEN** the Harness runs the Claude CLI with the Projects Root as the working directory and streams the reply over the existing chat SSE protocol

#### Scenario: The arch context never lands in a repo by fallback

- **WHEN** a chat request addresses the `arch` context and no self repo is pinned
- **THEN** the request fails with an explicit error and no CLI run starts in the self repo or any other registered repo

#### Scenario: The arch context stays out of project surfaces

- **WHEN** the operator lists projects (Projects tab or `GET /api/repos`)
- **THEN** no `arch` entry appears

### Requirement: Role instructions scope the agent to playground operations

The system SHALL append role instructions to every arch-scoped CLI run, sourced
from a file committed in the harness repo. The instructions SHALL state the agent's
responsibility (operating the playground: listing, inspecting, creating, and
organizing projects; answering questions and doing research across projects;
setting up background work through existing harness primitives) and its explicit
non-responsibility (developing harness features — such requests are redirected to
the harness dev chat).

#### Scenario: Arch runs carry the role prompt

- **WHEN** an arch-scoped CLI run starts
- **THEN** the committed role instructions are appended to the run's system prompt

#### Scenario: Repo-scoped runs are unaffected

- **WHEN** a CLI run starts for a registered repo (any lane)
- **THEN** no arch role instructions are appended and the run's arguments are unchanged from today

### Requirement: Arch session continuity

The Arch Agent chat SHALL retain conversation continuity the way repo chats do: a
follow-up prompt SHALL resume the same Claude session, its run SHALL occupy a
dedicated run slot keyed to the `arch` context (concurrent with repo runs, busy
against itself), and its transcript history SHALL be listable through the existing
sessions API addressed with the `arch` context.

#### Scenario: Follow-up arch turn resumes the session

- **WHEN** the operator sends a second prompt that depends on the first arch turn
- **THEN** the run resumes the prior session and the reply reflects earlier context

#### Scenario: Arch and repo runs do not block each other

- **WHEN** an arch turn is streaming and the operator prompts a repo dock
- **THEN** both runs proceed; a second concurrent arch prompt is rejected as busy

### Requirement: The Arch Agent surface is Advanced-gated

The Arch Agent UI surface SHALL be registered in the UI-mode capability map as
Advanced, so Basic (Simple) mode shows no Arch entry anywhere.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** no Arch Agent entry point is shown

#### Scenario: Available in Advanced mode

- **WHEN** the web UI is in Advanced mode
- **THEN** the Arch Agent chat is reachable from its standing entry point
