## ADDED Requirements

### Requirement: Provider-neutral conversation lifecycle
The harness SHALL read messages, tools and activity from Claude and Codex native transcripts. Every turn entry point SHALL validate session ownership against the selected repository and provider. Engine changes SHALL transfer a bounded transcript snapshot into a new native session, persist the visible history, and announce the handoff and any truncation. Missing source history SHALL produce an explicit error instead of silently dropping context.

#### Scenario: Switch and reload
- **WHEN** a Claude conversation switches to Codex and the browser reloads
- **THEN** earlier visible history and the new Codex reply remain available and the handoff is disclosed

### Requirement: Consistent automation configuration
Manual, loop and dispatched turns SHALL use the repository's selected provider, saved model and enabled harness tools. Loop observers SHALL recognize replies from either provider.

#### Scenario: Codex loop completes
- **WHEN** a Codex loop reply contains the completion sentinel
- **THEN** the loop reads that reply through the shared transcript interface and applies the existing completion policy

### Requirement: Explicit provider capabilities
The harness SHALL disclose provider-specific capabilities, instruction loading, native extension boundaries and unsupported management or browser integration. It SHALL preserve MCP inputs and outputs and SHALL NOT place injected MCP credentials in process arguments.

#### Scenario: Codex instructions
- **WHEN** a repo has CLAUDE.md and no AGENTS.md
- **THEN** Codex loads CLAUDE.md through its configured fallback discovery
