## Context

- The dock lanes live in `client/src/components/dashboard/PinnedAgent.jsx`: each lane is
  a `useFeature`-gated boolean (`showFiles`, `showConsole`, `showOpenspec`) whose panel
  renders over the chat while the composer stays below (`altViewActive`). A new lane is
  one more state + button + overlay branch following that exact pattern.
- Chat turns are spawned directly by `CliRunnerService` (`ClaudeWeb.App/Services/Chat/`):
  `CreateProcessInfo` (line ~685) assembles the `claude` argument list per the Verified
  CLI Contract. Builder lane runs `--dangerously-skip-permissions`; ask lane runs
  `--permission-mode plan`. There is no MCP awareness anywhere in the backend today.
- The reference implementation next door (birokrat-ai-platform) proves the injection
  shape: serialize `{ mcpServers: { birokrat: { command: "node", args: [<entry>],
  env: {...} } } }` to a temp file and pass `--mcp-config <path>` (that's what its
  ClaudeMonitor gateway does in `ClaudeCliRunner.cs:258-281`). The MCP server itself
  (`birokrat-ai-platform/mcp-server/app/dist/index.js`) is stdio-only, Node ≥ 18, and
  reads all parameters from env: `BIROKRAT_API_KEY`, `BIROKRAT_API_URL`,
  `BIROKRAT_API_KEYS` (JSON map name → {apiKey, url?}), plus optional
  `ARTIFACT_EXPORT_DIR` / `BIROKRAT_DEBUG` / `BIROKRAT_MAX_INLINE_CHARS`.
- Hard-won lessons from the platform team, inherited as constraints:
  1. 304 generated tools means Claude Code defers their schemas — the model loads them
     via `ToolSearch`. Our lanes don't restrict allowed tools, so this works, but any
     future allowed-tools tightening must keep `ToolSearch`.
  2. Their `mcp-server/.mcp.json` has a live API key committed — the design must make
     that mistake structurally impossible here (host-side storage only).
  3. Windows absolute-path permission rules don't match — irrelevant while we skip
     permissions, noted for the future.
- Per-repo persistence precedent: `DockRegistry` persists to `%APPDATA%\ClaudeWeb\dock.json`.
- Module conventions: controllers/services plug in via module extensions
  (`plans/INTEGRATION.md`); UI features default to Advanced in
  `client/src/context/UiModeContext.jsx`.

## Goals / Non-Goals

**Goals:**

- One new dock lane ("Tools") exposing per-repo tool configuration, Birokrat first.
- Enabled tool ⇒ `--mcp-config` injected into that repo's builder and ask turns.
- Secrets live in `%APPDATA%\ClaudeWeb\`, masked on read-back, never in the repo tree.
- Zero behavior change for repos with no tool configured.

**Non-Goals:**

- Importing or embedding the api-chatbot app, its audit panel, or the ClaudeMonitor
  gateway path (StructuredAsk/Understanding keep their current no-MCP contract).
- A general tool marketplace/plugin system — the registry is a typed list with one
  entry; a second tool is a later change that generalizes from two data points.
- Building the MCP server from the harness (operator builds it once in its own repo).
- Live-mode system-prompt addenda or maxTurns tuning (our lanes have no read-only
  system prompt to override; revisit if agents refuse to use the tools).

## Decisions

1. **Injection point: `--mcp-config` temp file in `CliRunnerService`, not a repo
   `.mcp.json`.** A repo-level `.mcp.json` would put the key in the working tree
   (committable — the exact failure observed in the platform repo) and requires
   project-server approval in some CLI modes. The temp-file + flag approach is proven by
   ClaudeMonitor, keeps secrets out of the repo, and composes per-run. The temp file is
   written under the harness's app-data temp area with a per-run name and deleted in the
   run's `finally`.

2. **Config store: new `ToolsConfigStore` service persisting
   `%APPDATA%\ClaudeWeb\tools.json`, keyed by repo id** — same lifecycle pattern as
   `DockRegistry`/`dock.json`. Shape: `{ [repoId]: { birokrat: { enabled, apiKey,
   apiUrl, companies: [{name, apiKey, url?}] } } }` plus a host-level
   `{ birokratServerEntry }`. Plaintext at rest (matches every other harness credential
   surface; the boundary is the OS account, per the repo's permission philosophy).

3. **API: `ToolsController` (module-extension pattern)** —
   `GET /api/tools?repoId=` (masked read), `PUT /api/tools/birokrat?repoId=` (full
   write; omitting the masked key field keeps the stored one), `GET/PUT
   /api/tools/host` (server entry path), `GET /api/tools/birokrat/check` (entry-script
   existence + `node` availability probe for the explicit enable-time error).

4. **Masking contract:** read-back returns `apiKeySet: true` + last 4 characters, never
   the key. The UI sends the key only when the operator types a new one — an untouched
   masked field round-trips as "keep existing".

5. **Injection wiring:** `ChatController` resolves the repo's effective tool config at
   turn start and passes an optional `mcpConfigJson` into `CliRunnerService.RunAsync`;
   `CreateProcessInfo` gains the temp-file + `--mcp-config` branch. Both lanes get it
   (ask lane in plan mode can still *call* read-only MCP tools; Birokrat writes are the
   operator's explicit opt-in via the enable toggle).

6. **Frontend:** `toolsDock: 'advanced'` in the UiMode capability map; `showTools` lane
   state in `PinnedAgent.jsx` mirroring the OpenSpec lane; new
   `components/dashboard/ToolsPanel.jsx` scoped to `tab.repoId` (dock-scoped, not
   global-repo-scoped, per the agent-dock delta spec).

7. **Env assembly mirrors the reference chatbot:** single-key mode sets
   `BIROKRAT_API_KEY` + `BIROKRAT_API_URL`; a non-empty company list additionally sets
   `BIROKRAT_API_KEYS` (JSON) with the first entry doubling as the default key/URL —
   byte-compatible with `api-chatbot/app/server.js:788-824` so behavior matches the
   proven integration.

## Risks / Trade-offs

- **Plaintext secrets in app-data.** Accepted: consistent with the harness's existing
  trust model (OS-account boundary); DPAPI hardening is a possible follow-up.
- **Ask lane gets live ERP access when enabled.** Plan mode blocks harness-side
  mutations but MCP tools execute server-side; the Birokrat API includes mutating
  endpoints. Mitigation: injection only happens when the operator explicitly enables
  the tool per repo; the panel copy states that enabling arms BOTH lanes.
- **Server checkout drift.** The host-level entry path points into a sibling repo we
  don't control; if its build output moves, runs fail at MCP startup. Mitigation: the
  `check` probe + explicit enable-time error; the CLI also surfaces MCP server startup
  failures in stderr, which the run already logs.
- **One-request-per-key serialization on the Birokrat side** and HTTP 202 polling are
  inherited behaviors of the server; nothing to do harness-side, but slow tool calls
  are expected and must not be misread as hangs.
- **Concurrent turns (builder + ask) each spawn their own MCP server process** — two
  node processes, fine for stdio servers, but both share one API key and Birokrat
  rejects concurrent requests per key; surfaced as tool-result errors, not crashes.
