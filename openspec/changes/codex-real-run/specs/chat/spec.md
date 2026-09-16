# chat — delta for codex-real-run

## ADDED Requirements

### Requirement: Codex turns match the real CLI

A codex-provider turn SHALL be driven exactly as codex-cli 0.153.4 accepts it: a
builder turn as `codex exec --json --skip-git-repo-check
--dangerously-bypass-approvals-and-sandbox … <prompt>`, a resumed turn as `codex exec
resume <threadId> …`, and the read-only ask lane as the `-c sandbox_mode="read-only"`
override on both (the resume subcommand has no sandbox flag); the child's stdin SHALL be
redirected and closed so nothing is appended to the prompt. The injected MCP config's url
servers SHALL become `mcp_servers.<name>.url` plus `bearer_token_env_var` overrides with
the bearer token placed only in the child's environment. The adapter SHALL treat
`{"type":"error"}` events and items of type `error` as non-terminal notices (logged,
remembered as the last notice), SHALL read item kinds from `item.type`, and SHALL error
the turn only on `turn.failed` — with that event's message, or the last notice when it
carries none; a non-zero exit without `turn.failed` SHALL surface stderr, else the last
notice. Loop sends and arch dispatches SHALL run a repository's turns on its persisted
provider, exactly as composer turns do.

#### Scenario: Unauthenticated real run fails once, legibly

- **WHEN** a codex turn runs with no credential and the CLI streams thread.started, several "Reconnecting…" error events, an error item, then turn.failed with a 401 message
- **THEN** the session event carries the thread id, no error is emitted before turn.failed, and exactly one error event carries the 401 message

#### Scenario: Ask lane on a resumed Codex thread

- **WHEN** an ask-lane turn resumes a Codex thread
- **THEN** the invocation is `codex exec resume <id> --json --skip-git-repo-check -c sandbox_mode="read-only" … <prompt>`

#### Scenario: The harness's own tool endpoint reaches a Codex agent

- **WHEN** a codex turn is injected the harness MCP config `{"arch":{"type":"http","url":…,"headers":{"Authorization":"Bearer T"}}}`
- **THEN** argv carries `mcp_servers.arch.url='…'` and `mcp_servers.arch.bearer_token_env_var='CLAUDEWEB_MCP_ARCH_TOKEN'`, the environment carries `CLAUDEWEB_MCP_ARCH_TOKEN=T`, and no argument contains `T`

#### Scenario: A loop on a codex repo runs codex

- **WHEN** an autopilot loop sends to a repository whose provider is codex
- **THEN** the runner starts a codex session for that send
