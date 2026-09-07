# Tasks: codex-real-run

## 1. Detect the real CLI

- [x] 1.1 Codex CLI absent on the box → installed `@openai/codex` (codex-cli 0.153.4); captured `exec`, `exec resume`, `login`, `mcp add` help and the unauthenticated `exec --json` stream
- [x] 1.2 `GET /api/codex-account` (installed, version, authenticated, method, home) via `codex login status`

## 2. Fix what the real binary breaks

- [x] 2.1 Transient `error` events / `item.type == "error"` are notices; only `turn.failed` is terminal; `TurnSink.LastNotice` feeds the runner's non-zero-exit message
- [x] 2.2 Items keyed by `item.type` (with `item_type` fallback)
- [x] 2.3 Ask lane → `-c sandbox_mode="read-only"` on new and resumed turns (resume has no `--sandbox`)
- [x] 2.4 url MCP servers → `mcp_servers.<name>.url` + `bearer_token_env_var`, token in the child's environment
- [x] 2.5 Stdin redirected by the adapter and closed by the runner
- [x] 2.6 Loops and arch dispatch pass `repo.Provider`
- [x] 2.7 `RepositoryRegistry.Clone` keeps `Provider` + `Handle` (the composer path ran codex repos on claude); `[CHAT] Engine …` log line

## 3. Credential through the existing settings mechanism

- [x] 3.1 `CodexCredentialsService` → `codex login --with-api-key` over stdin, scrubbed errors, re-probe
- [x] 3.2 `POST /api/codex-credentials { apiKey }`
- [x] 3.3 Codex chip + write-only `CodexKeyControl` (flag `codexKeyControl`), i18n en/tr
- [x] 3.4 `docs/providers.md`: exactly where the credential goes and how the runner picks it up

## 4. Prove it

- [x] 4.1 `CodexRealRunTests` pinned to the real argv / event / TOML / login-status shapes
- [x] 4.2 `check-codex-runner.mjs` + `codex-real-run-e2e.ps1`: isolated instance, real binary, throwaway codex repo — clean unauthenticated failure path with thread id, provider on lifecycle events, log evidence
- [x] 4.3 Authenticated end-to-end run, 2026-09-07 12:20 after the Operator's `codex login --device-auth` (ChatGPT plan): `codex-authenticated-e2e.ps1` 16/16 on an isolated instance of the branch — real builder turn produced commit f2a975a "codex hello" (hello.txt), `codex exec resume` recalled it, ask lane could not write, MCP probe `harness.harness_probe` called through the adapter's `-c mcp_servers.*` overrides and its token echoed back
