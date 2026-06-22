## Why

The harness has no way to answer "which web apps in my repositories expose themselves as local apps, and on what ports?" The registered-apps list (`repositories.json`) only knows what an operator manually added; it is blind to self-serving apps that already follow the local-exposure convention but were never registered. Today those apps (e.g. two in this very repo) can only be found by a human grepping `serve.*` files across every repo on the box. We want the harness to discover them automatically — across **all** registered repositories, not just its own — by sending a read-only agent to scan each repo and return a typed, validated list.

This also gives the harness its first **structured-output prompting** primitive: a reusable "ask an agent, get a typed object back" mechanism, modeled on the proven pattern in the sibling `web-flow-autodev` repo. Local-app discovery is the first consumer; the primitive is reusable.

## What Changes

- **New structured-output primitive** in `ClaudeWeb.App`: a typed report class drives both deserialization and the prompt's required-output schema (one source of truth, no drift), and a runner sends a prompt, isolates the JSON from the reply, deserializes with a validating parse, and retries on bad JSON by feeding the error back.
- **Signature-based discovery prompt**: a generic prompt that describes *what a local-app exposure looks like* (per `docs/local-exposure-convention.md`) and asks the agent to find every match — it **names no app and assumes no repo layout**, so it keeps working as apps are added and across unfamiliar repos.
- **On-demand, per-dock discovery**: a **"Discover local apps" button in each agent dock** in the dashboard. Clicking it runs discovery for **that dock's repository** (the repo the agent is pinned to) and shows the returned `{ name, port }` list (plus `folder`/`evidence`). No automatic run, no all-repos fan-out — apps in other repos are found by triggering discovery from *their* dock.
- **Read-only API endpoint** that, given the dock's repository, runs discovery for that one repo and returns the structured findings.
- **Reuses the existing `ClaudeMonitor.Client`** (the same synchronous client `web-flow-autodev` uses, at `prg\agentic-workflows\ClaudeMonitor.Client`) as the send mechanism — no new in-harness runner is invented. The scan runs **read-only** via a tool allowlist (no `Write`/`Edit`/`Bash`), so it cannot mutate any repo.
- **Understanding app** visualizing the render → send → extract → validate → retry → aggregate flow (per the repo convention for non-trivial work).

## Capabilities

- `discover-local-apps`: On demand (from a repository's agent dock), discover every directory in *that repository* that exposes itself as a local app (self-serving HTTP server on a fixed loopback port per the local-exposure convention) and return each one's name and port as a typed, validated, source-audited result — via a reusable structured-output prompting mechanism (typed report → rendered schema → send/extract/validate/retry). Other repositories' apps are found by triggering discovery from their own docks.

### Modified Capabilities
<!-- None. The registered-apps system (LocalProxyController / LocalAppConfig / repositories.json) is explicitly out of scope: discovery is by source scan, not by reading the registry. -->

## Impact

- **New code** under `ClaudeWeb.App/Services/StructuredAsk/`: `LocalAppExposureReport` (typed report + validating `Parse`), `OutputFormatRenderer` (reflection → JSON skeleton, ported from `web-flow-autodev`), `PromptUtils.ExtractJson` (ported), `LocalAppDiscoveryAsk` (the generic prompt + fill + run), `StructuredAskRunner` (a near-verbatim port of `web-flow-autodev`'s `AgentRunner`, built on the reused `ClaudeMonitor.Client`).
- **New controller** in `ClaudeWeb.App/Controllers` exposing the read-only per-repo discovery endpoint, plus a **"Discover local apps" button in the agent dock** (`client/src/components/dashboard/PinnedAgent.jsx`) wired to it (Advanced-mode capability in `client/src/context/UiModeContext.jsx`).
- **New build-time dependency**: a cross-repo `<ProjectReference>` from `ClaudeWeb.App.csproj` to `..\..\prg\agentic-workflows\ClaudeMonitor.Client\ClaudeMonitor.Client.csproj`. The harness no longer builds standalone without the `prg` checkout present (affects isolated self-dev builds / `swap.ps1`).
- **New run-time dependency**: the **ClaudeMonitor gateway on `localhost:5123`** (lives in `birokrat-ai-platform`) must be running; discovery preflights `IsAvailable()` and fails loud per repo if it is down.
- **Builds on existing pieces** (no reimplementation): `RepositoryRegistry.GetAll()` + each `RepositoryConfig`'s working directory.
- **Out of scope / untouched**: `LocalProxyController`, `LocalAppConfig`, `repositories.json` (the registered-apps path); no mutation of any repo; no full stage pipeline / persistence (a single one-shot ask per repo suffices).
- **Cost note**: each click runs exactly one agent against one repository (the dock's) — no automatic or all-repos fan-out — so cost is bounded and operator-initiated.
- **Frontend**: the dock button + a small Advanced-mode view of the returned list; the spec's spine is the server-side per-repo discovery + endpoint.
