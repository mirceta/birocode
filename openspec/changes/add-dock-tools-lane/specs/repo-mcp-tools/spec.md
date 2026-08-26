## Purpose

Lets the operator attach MCP tool servers to a Repo's Claude runs: a per-repo registry of
configurable tools (the Birokrat API MCP server first) whose parameters are set from the
web UI and whose MCP configuration is injected into the Claude CLI when the tool is
enabled — so an agent working in that Repo can call the tool's live API.

## ADDED Requirements

### Requirement: Per-repo Birokrat tool configuration

The system SHALL maintain, per repository, a configuration for the Birokrat MCP tool
consisting of: an enabled/disabled toggle (default disabled), the Birokrat API key, the
Birokrat API base URL (defaulting to the public `https://next.birokrat.si/api/v2/`), and
an optional multi-company map of named entries each holding an API key and an optional
per-company base URL. The web UI SHALL let the operator read and edit this configuration
for the opened repository and persist it across harness restarts.

#### Scenario: Operator configures and enables the tool

- **WHEN** the operator enters an API key for a repository's Birokrat tool and enables it
- **THEN** the configuration persists across a harness restart and the tool is reported
  as enabled for that repository

#### Scenario: Multi-company map

- **WHEN** the operator defines named companies each with its own API key
- **THEN** the stored configuration carries the full map, and Claude runs in that
  repository can address each named company through the tool

### Requirement: Secrets are stored host-side and masked on read-back

Tool secrets (API keys) SHALL be persisted only in the Harness's host-side app-data
store — never written into the repository working tree, where they could be committed.
API responses that return a stored configuration SHALL mask secret values (revealing at
most a short identifying suffix); the full secret SHALL only travel from client to server
when the operator sets or replaces it.

#### Scenario: Secret never lands in the repo

- **WHEN** a repository's Birokrat tool is configured and used in chat runs
- **THEN** no file inside the repository working tree contains the API key

#### Scenario: Read-back is masked

- **WHEN** the web UI fetches an existing tool configuration
- **THEN** the API key field is masked, while non-secret fields (URL, company names,
  enabled state) are returned in full

### Requirement: Enabled tools are injected into the repo's Claude runs

When a repository has its Birokrat tool enabled, every chat turn the Harness runs in that
repository (builder and ask lanes alike) SHALL launch the Claude CLI with an MCP server
configuration for the Birokrat server carrying the stored parameters, so the run exposes
the Birokrat MCP tools to the agent. When the tool is disabled or unconfigured, the CLI
invocation SHALL be identical to one in a repository with no tool configuration at all.

#### Scenario: Enabled tool reaches the agent

- **WHEN** a chat turn runs in a repository whose Birokrat tool is enabled with a valid
  key
- **THEN** the agent can discover and call Birokrat MCP tools during that turn, and the
  calls are routed with the configured key and base URL

#### Scenario: Disabled tool leaves runs untouched

- **WHEN** a chat turn runs in a repository whose Birokrat tool is disabled
- **THEN** the CLI invocation contains no MCP configuration and no Birokrat tools are
  available to the agent

#### Scenario: Transient config does not outlive the run

- **WHEN** a chat turn that injected MCP configuration completes (successfully or not)
- **THEN** any secret-bearing temporary configuration material created for that run is
  removed from disk

### Requirement: The Birokrat MCP server location is a host-level setting

The path to the Birokrat MCP server entry script SHALL be a host-level Harness setting
(one value for the whole host, since the server checkout lives outside the opened
repositories). Its default resolution SHALL be machine-independent: the
`birokrat-ai-platform` checkout is assumed to be a **sibling of a registered
repository**, and its built `mcp-server/app/dist/index.js` is probed relative to each
registered repository's parent directory (both the nested
`birokrat-ai-platform/birokrat-ai-platform/…` and a flat clone layout) — never via a
host-specific absolute path. The explicit host-level setting remains as an override for
non-sibling checkouts. When no entry script resolves or the configured one does not
exist on disk, enabling the tool SHALL surface an explicit error to the operator rather
than launching runs with a broken MCP server.

#### Scenario: Missing server surfaces an error

- **WHEN** the operator enables the Birokrat tool while the configured server entry
  script does not exist on disk
- **THEN** the UI shows an explicit error naming the missing path, and chat runs are not
  launched with the broken MCP configuration

#### Scenario: Sibling checkout resolves on any machine

- **WHEN** the Harness runs on a machine where the `birokrat-ai-platform` checkout sits
  next to a registered repository and no host-level path is set
- **THEN** the server entry script resolves to that sibling checkout's built
  `dist/index.js` without any machine-specific configuration

### Requirement: Preflight readiness check

The web UI SHALL offer a preflight action for the Birokrat tool that verifies
server-side, against the saved configuration, every condition a chat run needs for the
tool to work on the current machine: the tool is enabled, an API key is stored, the
`node` runtime actually starts under the Harness's environment, the server entry script
resolves and exists on disk, and the Birokrat API answers an authenticated request using
the effective key and base URL (the same auth header the MCP server sends). Each
condition SHALL be reported individually as pass, fail, or skipped-with-reason, with
detail text naming the resolved path, version, URL, or HTTP status — so a failing
condition tells the operator what to fix when moving to a new machine.

#### Scenario: All conditions met

- **WHEN** the operator runs preflight on a machine where every condition holds
- **THEN** the UI reports the tool ready, with each check green and its detail shown

#### Scenario: Missing sibling checkout is named

- **WHEN** preflight runs on a machine without the `birokrat-ai-platform` sibling
  checkout and no host-level override
- **THEN** the server-entry check fails with a detail naming the expected sibling
  location(s), and the overall result is not-ready

#### Scenario: Bad key or unreachable API

- **WHEN** preflight runs with a stored key the Birokrat API rejects, or a base URL that
  cannot be reached
- **THEN** the API check fails with the HTTP status or the connection error, while the
  local checks still report their own results
