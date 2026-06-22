## 1. Reuse the client + port the pure helpers

- [x] 1.1 Add a cross-repo `<ProjectReference>` from `ClaudeWeb.App.csproj` to `..\..\prg\agentic-workflows\ClaudeMonitor.Client\ClaudeMonitor.Client.csproj`; confirm `ClaudeWeb.App` still builds and `using ClaudeMonitor.Client;` resolves
- [x] 1.2 Create `ClaudeWeb.App/Services/StructuredAsk/` and port `OutputFormatRenderer` from `web-flow-autodev` (reflection over `[JsonPropertyName]`/`[Description]` → JSON skeleton; scalar/array/list/nested handling)
- [x] 1.3 Port `PromptUtils.ExtractJson` (strip conversational prose + markdown fences, brace-balance to the first complete JSON object)
- [x] 1.4 Add a tiny unit check (or scratch console) confirming `OutputFormatRenderer.Render(typeof(LocalAppExposureReport))` emits the expected skeleton and `ExtractJson` isolates JSON from prose+fences

## 2. Typed report + validating parse

- [x] 2.1 Define `LocalAppExposureReport { List<LocalAppFinding> apps }` and `LocalAppFinding { name, port, folder, evidence }` with `[JsonPropertyName]` + `[Description]` on every property
- [x] 2.2 Implement `static LocalAppExposureReport Parse(string json)`: deserialize (null → `JsonException`), validate each finding (name/folder non-empty, `1 ≤ port ≤ 65535`); empty `apps` list is valid ("none found")
- [x] 2.3 Unit-test `Parse`: accepts valid findings + empty list; throws on out-of-range/zero port and on empty name/folder

## 3. StructuredAskRunner (port AgentRunner onto the reused client)

- [x] 3.1 Implement `StructuredAskRunner.RunAsync<T>(prompt, parse, workingDirectory, ct)` as a near-verbatim port of `web-flow-autodev`'s `AgentRunner`: construct `ClaudeMonitorClient(appName)`, preflight `IsAvailable()` (fail loud with a clear message if the :5123 gateway is down), then `SendRequest(new ClaudeRequest{ Prompt, SystemPrompt, WorkingDirectory, AllowedTools })`
- [x] 3.2 Set `AllowedTools` to read-only tools only (`Read`, `Grep`, `Glob`, `LS`); omit `Write`/`Edit`/`Bash` so the scan cannot mutate the repo
- [x] 3.3 `ExtractJson(resp.Result)` → `parse`; on `JsonException` re-prompt with the bad reply + error message and retry (bounded, ~2 attempts), mirroring `AgentRunner`'s correction loop
- [x] 3.4 Return a typed success/failure result (report or error) — gateway-down, non-success response, and exhausted retries all surface as failures, never thrown past the caller

## 4. LocalAppDiscoveryAsk (the generic, signature-based ask)

- [x] 4.1 Author the discovery prompt template: describe the local-app-exposure *shape* per `docs/local-exposure-convention.md` (own HTTP server, fixed loopback port, dual-stack, serves at `/`, relative URLs); require `name`+`port`+`folder`+`evidence`; end in `### Output format` + `{{OUTPUT_FORMAT}}`. **Name no app; assume no repo layout.**
- [x] 4.2 Fill `{{OUTPUT_FORMAT}}` via `OutputFormatRenderer.Render(typeof(LocalAppExposureReport))` and run through `StructuredAskRunner` with `LocalAppExposureReport.Parse`
- [x] 4.3 Review the prompt against the spec's "names no app" requirement (no `homepage`/`openspec-port-app`/etc. anywhere in the text)

## 5. Per-repo discovery endpoint + dock trigger

- [x] 5.1 Implement single-repo discovery: resolve the caller's repo via `RepositoryRegistry`, run `LocalAppDiscoveryAsk` once with `workingDirectory =` that repo's path; no iteration over all repos
- [x] 5.2 Return the typed findings for that one repo; a failed run surfaces as an explicit error to the caller (no partial/fabricated results)
- [x] 5.3 Add a controller exposing the read-only per-repo discovery endpoint (takes the caller's repo id); no write verbs, no read of `repositories.json` as a discovery source, no all-repos fan-out
- [x] 5.4 Register the service(s) in DI (follow `plans/INTEGRATION.md` module conventions)
- [x] 5.5 Add a **"Discover local apps" button to the agent dock** (`client/src/components/dashboard/PinnedAgent.jsx`), gated as an Advanced-mode capability (`localAppDiscovery`) in `client/src/context/UiModeContext.jsx`; on click, call the endpoint for that dock's repo and render the returned `{ name, port }` list (disabled while in flight). i18n keys added (en/tr); client builds clean

## 6. Verify end to end

- [x] 6.0 ClaudeMonitor gateway running on `localhost:5123` — `/api/health` 200 and a trivial prompt now returns `success:true` (the earlier "cannot spawn claude" issue was fixed gateway-side in birokrat-ai-platform).
- [x] 6.1 Build the harness to an isolated dir per `docs/claude-web/self-dev.md` (do not build into the running app's bin/port); confirm the cross-repo `prg` reference resolves in that build — *backend built clean to `.claudeweb-preview/bin`*
- [x] 6.2 Ran discovery against this repo via the real path (`LocalAppDiscoveryAsk` → `StructuredAskRunner` → gateway): returned `homepage`:5305 and `openspec-port-app`:5310 — plus `global-example`:5200 and `chat-systest-hub`:5320, found by signature (not named in the prompt), each with real `file:line` evidence.
- [x] 6.3 Ran discovery against a *different* repo (web-flow-autodev): returned only that repo's apps (`Autodev.Web`:5300, `homepage`:5307) — scoped to the requested repo, no fan-out.
- [x] 6.4 Read-only held: no tracked files modified by either scan. Clean-failure also verified earlier (a gateway error surfaced through `StructuredAskRunner` as a typed failure, not thrown).

## 7. Understanding app + docs

- [x] 7.1 Build/refresh `understanding-app/index.html` visualizing the flow: typed report → rendered schema in prompt → send via reused `ClaudeMonitor.Client` (→ :5123 gateway) → ExtractJson → validating parse → retry-on-bad-JSON → return to the dock (build-less, self-contained, relative URLs)
- [x] 7.2 Advanced-mode UI surface of the discovered list — implemented as the dock button (5.5); capability `localAppDiscovery` added to the capability map
- [x] 7.3 `openspec validate --strict discover-local-apps` clean; ready to archive on ship
