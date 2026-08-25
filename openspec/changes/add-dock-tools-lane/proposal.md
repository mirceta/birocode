## Why

The birokrat-ai-platform repo (sibling checkout, `C:\Users\HP\Desktop\playground\birokrat-ai-platform`)
already has a working "api-chatbot" that gives Claude live access to the Birokrat ERP
API through a stdio MCP server (`mcp-server/app/dist/index.js`, 304 generated tools).
Our Harness runs Claude Code over repos but has **no way to attach MCP tool servers**
to those runs — so an agent working in a repo cannot touch Birokrat even though the
server and a proven integration pattern exist one directory over. Bringing that
capability into the Harness turns every dock agent into a potential Birokrat operator,
configured from the phone.

## What Changes

- **New "Tools" lane on the agent dock** — a sibling of Builder / Ask / Files /
  Console / OpenSpec in `PinnedAgent.jsx`. Picking it shows a Tools panel over the
  chat (composer stays below), same overlay contract as the Files/Console/OpenSpec
  lanes. Advanced-gated (new `toolsDock` feature in the UI-mode capability map).
- **A per-repo tool registry** with one built-in tool to start: **Birokrat MCP
  server**. The panel lets the operator set the parameters the server actually reads:
  API key (`BIROKRAT_API_KEY`), base URL (`BIROKRAT_API_URL`, default
  `https://next.birokrat.si/api/v2/`), optional multi-company map
  (`BIROKRAT_API_KEYS`: name → {apiKey, url?}), and an enable/disable toggle. The
  server entry path (`node …/mcp-server/app/dist/index.js`) is a host-level setting
  since it lives outside the opened repo.
- **MCP config injection into chat runs**: when the opened repo has an enabled tool,
  `CliRunnerService` materializes a temp MCP config file and appends
  `--mcp-config <path>` to the `claude` invocation (builder and ask lanes alike) —
  the same mechanism the platform's ClaudeMonitor gateway uses. No enabled tool →
  byte-identical CLI invocation to today.
- **Secrets stay host-side**: parameters persist under `%APPDATA%\ClaudeWeb\`
  (per-repo keyed store, same pattern as `dock.json`), never in the repo working
  tree — the platform repo's committed live API key in `mcp-server\.mcp.json` is the
  cautionary tale. The API key is write-only from the web UI (masked on read-back).

## Capabilities

### New Capabilities

- `repo-mcp-tools`: per-repo MCP tool registry — which tools exist (Birokrat first),
  their parameter schema and persistence, secret handling, and the injection of
  enabled tools' MCP config into the repo's Claude CLI runs.

### Modified Capabilities

- `agent-dock`: the dock gains a Tools lane (sibling overlay to Files / Console /
  OpenSpec) that hosts the per-repo tool configuration panel; lane exclusivity and
  Advanced gating follow the existing lane rules.

## Impact

- **Backend**: new `ToolsController` + config store service (module-extension
  pattern per `plans/INTEGRATION.md`); `CliRunnerService.CreateProcessInfo` gains the
  `--mcp-config` branch; temp-file lifecycle tied to the run.
- **Frontend**: `PinnedAgent.jsx` (new lane + overlay panel), new
  `components/dashboard/ToolsPanel.jsx`, `UiModeContext.jsx` capability map entry
  (`toolsDock: 'advanced'`).
- **External dependency**: a built Birokrat MCP server on the host
  (`npm install && npm run build` in `birokrat-ai-platform/mcp-server/app`); Node ≥ 18.
  The Harness only points at `dist/index.js` — it does not build or vendor it.
- **Not touched**: the ClaudeMonitor gateway path (StructuredAsk/Understanding) keeps
  running without MCP config; the api-chatbot app itself is not imported.
- **Known constraint carried over from the platform**: with 304 deferred tool
  schemas, Claude Code needs `ToolSearch` available to load them — true in our
  builder lane (`--dangerously-skip-permissions`) and ask lane (plan mode), so no
  allowed-tools change is needed.
