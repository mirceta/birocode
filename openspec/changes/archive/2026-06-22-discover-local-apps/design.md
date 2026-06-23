## Context

The harness (Claude Web, `ClaudeWeb.App`, .NET 8) already runs Claude Code agents, but
only through its own streaming path: `CliRunnerService.RunAsync(...)` spawns
`claude -p … --output-format stream-json` and emits loosely-typed events
(`token`/`thinking`/`tool`/`done`) to the chat UI. It has no synchronous "ask once, get a
parsed object" path.

The sibling repo `web-flow-autodev` already solved typed agent output with a proven
pattern (`OutputFormatRenderer` / `PromptUtils.ExtractJson` / `AgentRunner` / typed
`Report` classes), and its `AgentRunner` is built on a small, shared, synchronous client —
**`ClaudeMonitor.Client`** (`net8.0`, platform-neutral) at
`C:\Users\Administrator\Desktop\playground\prg\agentic-workflows\ClaudeMonitor.Client\`.
That client POSTs to a **ClaudeMonitor gateway on `localhost:5123`** (which lives in
`birokrat-ai-platform\ClaudeMonitor\ClaudeMonitor.App`, a WinForms+ASP.NET app that must be
running) and returns the full reply text in `ClaudeResponse.Result`.

Per the operator's decision, we **reuse `ClaudeMonitor.Client`** rather than build a new
in-harness runner mechanism. This lets us port `AgentRunner` ~verbatim (it is synchronous
and already returns full text), at the cost of two new external dependencies (see Risks).

Reference (read off disk):
- `prg\agentic-workflows\ClaudeMonitor.Client\ClaudeMonitorClient.cs` — the client we reuse.
- `web-flow-autodev\app\Autodev.AgenticStage\` — `OutputFormatRenderer.cs`, `PromptUtils.cs`,
  `agent_runner/AgentRunner.cs`, and `BehaviorStage.cs`/`BehaviorReport.cs` (prompt↔report contract).

## Goals / Non-Goals

**Goals:**
- A reusable structured-output primitive in `ClaudeWeb.App`: typed report ⇒ rendered
  schema in the prompt ⇒ send ⇒ extract JSON ⇒ validating parse ⇒ retry-on-bad-JSON.
- **Reuse the existing `ClaudeMonitor.Client`** as the send mechanism — do not invent a new
  one, do not fork `CliRunnerService`.
- Discover local-app exposures by **signature** (the convention's shape), with a prompt
  that names no app and assumes no repo layout.
- Discover **one repository on demand**, triggered by a "Discover local apps" button in
  that repository's agent dock. Apps in other repos are found by triggering it from their
  own docks — no automatic run, no all-repos fan-out.
- Strictly read-only: the discovery agent cannot modify a scanned repo.

**Non-Goals:**
- No new bespoke agent-invocation mechanism in the harness (that is the whole point of
  reusing `ClaudeMonitor.Client`).
- No registering of discovered apps, and no reading of `repositories.json` as a discovery
  source (`LocalProxyController` / `LocalAppConfig` are out of scope).
- No full stage pipeline: no `StageRunner` topological sort, no `StageState` persistence,
  no conditions/multi-phase prompts. A single one-shot ask per repo is enough.
- Frontend display is a follow-up; the spine is server-side discovery + the endpoint.

## Decisions

### D1: Port the two pure helpers; reuse the shared client for transport
`OutputFormatRenderer` (reflection over `[JsonPropertyName]`/`[Description]` → JSON
skeleton) and `PromptUtils.ExtractJson` (strip prose/fences, brace-balance) are pure,
dependency-free files that live in `web-flow-autodev`'s own project (not in the shared
client lib). Port them ~verbatim into `ClaudeWeb.App/Services/StructuredAsk/` rather than
referencing the heavy `Autodev.AgenticStage` project. The *transport*, by contrast, is the
shared `ClaudeMonitor.Client`, which we reuse rather than reimplement.

### D2: Reuse `ClaudeMonitor.Client`; port `AgentRunner` ~verbatim
Add a cross-repo `<ProjectReference>` from `ClaudeWeb.App.csproj` to
`..\..\prg\agentic-workflows\ClaudeMonitor.Client\ClaudeMonitor.Client.csproj` (same client
web-flow-autodev uses). The runner — `StructuredAskRunner.RunAsync<T>(prompt, parse)` — is
a near-verbatim port of `AgentRunner`: construct `ClaudeMonitorClient(appName)`, preflight
`IsAvailable()` (fail loud if the :5123 gateway is down), `SendRequest(new ClaudeRequest{
Prompt, SystemPrompt, WorkingDirectory, AllowedTools })`, then `ExtractJson(resp.Result)`
→ `parse`, and on `JsonException` re-prompt with the bad reply + error (bounded retries,
~2). Because the client is synchronous and returns the complete text, **no token
accumulator is needed** — this is the simplification the reuse buys.
*Alternative considered:* a token-accumulating wrapper over the harness's own
`CliRunnerService` (no new deps, fully self-contained). Rejected per operator decision in
favor of reusing the proven client; the trade is recorded in Risks.

### D3: Enforce read-only via the tool allowlist
`ClaudeMonitor.Client` does not expose `--permission-mode plan`, but `ClaudeRequest` has
`AllowedTools`. Set it to read-only tools only (e.g. `Read`, `Grep`, `Glob`, `LS`) and omit
every mutating tool (`Write`, `Edit`, `Bash`, …) so the discovery scan cannot modify a
repo. *Alternative:* trust the prompt to "only read" — rejected; an allowlist is a
structural guard, not a request.

### D4: Per-dock, on-demand, single-repo discovery
Discovery runs for exactly one repository per invocation — the one whose agent dock
triggered it. The caller (the dock) supplies its repository id; the server resolves that
repo via `RepositoryRegistry`, calls `StructuredAskRunner` once with
`ClaudeRequest.WorkingDirectory =` that repo's path, and returns its findings. There is no
iteration over `RepositoryRegistry.GetAll()` and no aggregation. A failed run surfaces to
the calling dock as an explicit error. Cross-repo coverage is achieved by the dashboard
having a dock per repo, each able to discover its own repo. *Alternative considered:* an
all-repos fan-out endpoint that aggregates — rejected per operator decision: discovery
should be operator-initiated per dock, not an automatic sweep (bounds cost and keeps the
result tied to the dock that asked).

### D5: The typed report shape
`LocalAppExposureReport { List<LocalAppFinding> apps }`, each finding
`{ name, port, folder, evidence }` with `[JsonPropertyName]` + `[Description]` carrying the
agent-facing hint. `static Parse(json)`: deserialize (null → throw), then validate every
finding (name/folder non-empty, `1 ≤ port ≤ 65535`); empty `apps` is valid ("none found").
The report describes one repository's findings and stays repo-agnostic (the controller
already knows which repo it asked), so it is reusable by future structured asks.

### D6: Endpoint surface + dock trigger
A new read-only controller exposes a per-repo discovery endpoint that takes the caller's
repository id and returns that one repo's structured findings (no write verbs; does not
read `repositories.json` as a discovery source). The trigger is a **"Discover local apps"
button in the agent dock** (`client/src/components/dashboard/PinnedAgent.jsx`, which is
already pinned to a repo and carries `repoPath`/`localApps`), gated as an Advanced-mode
capability. Clicking it calls the endpoint for that dock's repo and renders the returned
`{ name, port }` list in the dock.

## Risks / Trade-offs

- **New build-time coupling: cross-repo `<ProjectReference>` to `prg`.** The harness is
  today self-contained (CLI-only, no Anthropic SDK deps); after this it will not build unless
  the `prg` checkout sits at the expected sibling path. → Affects isolated self-dev builds and
  `swap.ps1`; document the requirement, and keep the in-harness accumulator (the D2
  alternative) as a documented fallback if the coupling proves painful.
- **New run-time dependency: the ClaudeMonitor gateway on :5123** (lives in a third repo,
  `birokrat-ai-platform`). Discovery fails if it is not running. → `IsAvailable()` preflight
  fails loud per repo with a clear message; per-repo failure isolation (D4) keeps it
  diagnosable.
- **Two agent-invocation paths now exist in the harness** (`CliRunnerService` for chat,
  `ClaudeMonitor.Client` for structured asks). → Accept as the explicit cost of reuse; scope
  the new path to structured asks only and document why.
- **Cost / latency: each click spawns one agent run.** → Bounded by being operator-initiated
  and single-repo (no automatic or all-repos sweep); read-only tools; consider disabling the
  dock button while a discovery for that dock is in flight.
- **Agent under-discovers or hallucinates a port.** → The `evidence` field (file+line of the
  bind) makes findings auditable; the validating `Parse` rejects out-of-range ports; the
  prompt anchors on `docs/local-exposure-convention.md`.
- **Read-only is allowlist-enforced, not plan-mode.** → Acceptable: omitting all mutating
  tools is a structural guard; revisit if the gateway later exposes plan mode.

## Open Questions

- **Accept the two external dependencies** (cross-repo project ref + :5123 gateway), or keep
  discovery self-contained on `CliRunnerService` (D2 alternative)? Proceeding with reuse per
  operator decision; this records that it is reversible.
- Cache results per repo (manual refresh) to avoid re-running agents on every endpoint hit?
  Deferred — start stateless, add a TTL if cost bites.
- Should the runner read the gateway port from config rather than the client's `5123`
  default? Likely yes if the gateway port is ever non-default; trivial to thread through.
