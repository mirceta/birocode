## 1. Backend — config store and API

- [x] 1.1 Add `ToolsConfigStore` service persisting `%APPDATA%\ClaudeWeb\tools.json`
      (per-repo `birokrat` config + host-level `birokratServerEntry` defaulting to the
      sibling checkout's `mcp-server/app/dist/index.js`), following the
      `DockRegistry`/`dock.json` load-lazily/save-on-write pattern.
- [x] 1.2 Add `ToolsController` + `ToolsModuleExtensions` (per `plans/INTEGRATION.md`):
      `GET /api/tools?repoId=` (masked read: `apiKeySet` + last-4, full non-secret
      fields), `PUT /api/tools/birokrat?repoId=` (absent masked key = keep stored),
      `GET/PUT /api/tools/host`, `GET /api/tools/birokrat/check` (entry-script exists +
      `node` on PATH).
- [x] 1.3 Unit-cover the masking round-trip (write key → masked read → write without
      key keeps it; write with new key replaces it) and the multi-company env assembly.

## 2. Backend — MCP injection into chat runs

- [x] 2.1 Build the MCP config JSON for an enabled repo (env mirrors
      `api-chatbot/server.js`: single-key → `BIROKRAT_API_KEY`+`BIROKRAT_API_URL`;
      companies present → additionally `BIROKRAT_API_KEYS`, first entry as default).
- [x] 2.2 Thread optional `mcpConfigJson` from `ChatController` (both lanes) into
      `CliRunnerService.RunAsync`; in `CreateProcessInfo`, write it to a per-run temp
      file under app-data and append `--mcp-config <path>`; delete the file in the
      run's `finally`. No enabled tool → argument list byte-identical to today.
- [x] 2.3 Refuse to inject (and surface the error on enable/check) when the configured
      server entry script is missing on disk.

## 3. Frontend — Tools lane and panel

- [x] 3.1 Add `toolsDock: 'advanced'` to the capability map in
      `client/src/context/UiModeContext.jsx`.
- [x] 3.2 Add the Tools lane to `PinnedAgent.jsx`: `showTools` state mirroring the
      OpenSpec lane (button, aria-selected, mutual exclusion with other lanes/apps,
      `chatShowing` guard).
- [x] 3.3 Build `components/dashboard/ToolsPanel.jsx` scoped to `tab.repoId`: enable
      toggle, API key (masked placeholder when set), base URL with public default,
      multi-company list editor, host-level server path field, check-probe result and
      enable-time error display, copy noting that enabling arms both Builder and Ask.
- [x] 3.4 i18n keys for the lane label and panel strings (en + tr).

## 4. Verification and docs

- [x] 4.1 `openspec validate --strict` passes; `npm --prefix client run build` and
      `dotnet build` clean; full test suite green (113/113).
- [x] 4.2 Live check per `docs/claude-web/browser-testing.md`: configure a repo with a
      real key, ask the dock agent to call a read-only Birokrat tool (e.g. a
      `__parameters` tool) and confirm tool discovery via ToolSearch works; then
      disable and confirm the next run has no MCP tools.
      *Verified live 2026-08-25:* with the operator's real key saved, a dock run
      discovered the `mcp__birokrat__*` tools via ToolSearch and
      `sifranti_artikli_prodajni_artikli_storitve__simple_get_1` returned HTTP 200
      with the full article list from the operator's LAN API. (Disable-path already
      covered by unit tests: disabled → `BuildMcpConfigJson` returns null.)
- [ ] 4.3 Confirm no key material appears in the repo working tree or run logs; temp
      mcp-config files are gone after runs (including a stopped run).
      *Code-level guarantees in place* (app-data store unit-tested; deletion in the
      run's `finally`; logs carry no key material); observe on the same live session
      as 4.2.
- [x] 4.4 Update the Understanding app (`understanding-app/index.html`) explaining the
      tools flow (panel → store → temp mcp-config → claude → stdio server → Birokrat).

## 5. Portability — sibling-checkout resolution and preflight

- [x] 5.1 `ToolsConfigStore.ResolveServerEntry`: drop the host-specific absolute
      fallback (`~/Desktop/playground`); probe the `birokrat-ai-platform` checkout as a
      sibling of each registered repo's parent, in both the nested
      (`birokrat-ai-platform/birokrat-ai-platform/…`) and flat clone layouts; host-level
      explicit path stays as the override. Unit-cover all three resolution paths.
- [x] 5.2 `GET /api/tools/birokrat/preflight?repoId=`: five server-side checks against
      the saved config — enabled, key stored, `node --version` actually runs, server
      entry resolved+exists (failure names the expected sibling locations), and an
      authenticated `X-API-KEY` GET to `<apiUrl>/sifrant/pagelen` (15 s timeout — a
      cold Birokrat service took >6 s on its first answer after idle; 401/403
      flagged as key-rejected; skipped when no key). Response: `{ready, checks[]}`.
- [x] 5.3 ToolsPanel: Preflight button beside Save rendering the pass/fail/skip
      checklist with details, plus the "checks saved settings — save first" hint; i18n
      (en + tr); toolsPanel.css rows.
- [ ] 5.4 Verify: unit suite green, client + server build clean,
      `openspec validate --strict` passes, live preflight returns all-green on the
      operator box.
      *Status 2026-08-25:* suite 117/117, builds clean, validate passes; deployed to
      live 14:30 (kept). Route verified live (401 behind auth, not 404) and every
      condition verified individually on this box (node runs, sibling entry resolves,
      API probe HTTP 200 with the stored key) — awaiting the operator pressing
      Preflight in the panel for the end-to-end all-green.
