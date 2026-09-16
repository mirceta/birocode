# arch-agent — delta for provider-agnostic-runner

## ADDED Requirements

### Requirement: list_agents reports the provider
`list_agents` SHALL report, for every repo agent on the arch's own machine,
the provider its turns run under (`claude` | `codex`), so the arch can name it
when reporting and the Operator can see which engine an agent uses.

#### Scenario: Provider surfaced
- **WHEN** a local repo's provider is set to codex and the arch calls `list_agents`
- **THEN** that agent's entry carries `provider: "codex"` while the others read `claude`
