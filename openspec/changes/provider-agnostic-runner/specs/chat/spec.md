# chat — delta for provider-agnostic-runner

## ADDED Requirements

### Requirement: Pluggable agent provider
The harness SHALL run a chat turn through a per-provider adapter chosen at
turn start: `claude` (the default — the Claude Code CLI, behaviour unchanged)
or `codex` (the OpenAI Codex CLI in headless `exec --json` mode). The
provider-neutral turn lifecycle — run record, activity ledger,
turn.start/turn.ended events, per-repo single-flight, cancellation and
transcript capture — SHALL be identical for every provider, so availability,
loops, dispatch and wake-ups behave the same. The effective provider SHALL
resolve as: the chat request's `provider` override, else the repository's
persisted provider, else `claude`; it SHALL be persisted per repository,
settable from the dock, and surfaced in the repo listing. A Codex turn SHALL
receive the same per-repo MCP tool configuration (stdio servers) as a Claude
turn, SHALL map the read-only ask lane to a read-only sandbox, and SHALL
refuse invocations requiring structural tool denials (management agents on
Codex are deferred); browser mode SHALL remain claude-only.

#### Scenario: Default provider is unchanged Claude
- **WHEN** a turn starts with no provider override on a repo with no provider set
- **THEN** the spawned invocation and the translated event stream are exactly the pre-change Claude behaviour

#### Scenario: Codex turn end to end
- **WHEN** a repo's provider is `codex` and a builder turn starts
- **THEN** the harness spawns `codex exec --json` in the repo, streams the thread id as the session, the agent message as tokens, command/file/MCP items as tool events, and usage/done at turn completion — into the same transcript store

#### Scenario: Codex resume
- **WHEN** a turn carries a session id captured from a prior Codex turn
- **THEN** the harness spawns `codex exec resume <threadId>` and the conversation continues

#### Scenario: Ask lane on Codex is read-only
- **WHEN** an ask-lane turn runs under Codex
- **THEN** the invocation carries a read-only sandbox and no bypass flag
