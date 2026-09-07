# Codex on this box — try-it-out runbook (task 9aaf5da2, openspec codex-real-run)

## What is proven today, what is not

Proven on the real codex-cli 0.153.4 binary, without a credential: the harness
spawns `codex exec --json` for a repo whose engine is codex (from the composer, and
by code path from loops and arch dispatch), captures the thread id as the session,
logs the CLI's transient notices, surfaces exactly one error with the CLI's verdict,
and closes the turn with `provider=codex` on the lifecycle events. The dashboard
probe reports installed / version / not logged in / the credential home.

**Never executed here**: an authenticated Codex turn, an MCP tool call made by
Codex, a commit produced by Codex, `codex exec resume` on a real thread, the
read-only sandbox on a real turn, and `codex login --with-api-key` through the
dashboard field. All of those exist as code and tests but have not run for real.

## (a) Supply the credential

The Codex login is per Windows user and per `CODEX_HOME`. The live harness
(`.selfdev-build\run-bin\ClaudeWeb.exe`) and every isolated test instance run as
**BIRO\Administrator** with no `CODEX_HOME`, so the credential must end up in
`C:\Users\Administrator\.codex\auth.json`. Either:

- **Console on the box, logged in as Administrator** (works today, independent of
  which harness build is deployed): `codex login` (ChatGPT plan, opens a browser),
  or `codex login --device-auth`, or `echo %OPENAI_API_KEY% | codex login --with-api-key`.
- **Dashboard** (only on a build that contains this change, see (b)): Codex chip →
  *OpenAI API key* → paste → *Log in*. The harness pipes the key to
  `codex login --with-api-key` over stdin and Codex writes `auth.json` itself.

Check: `codex login status` exits 0 and prints how you are logged in. On a build
with this change `GET /api/codex-account` shows the same.

## (b) Which harness runs the test

The deployed harness on :5099 runs **main**. It has none of this change: no Codex
chip, no `/api/codex-account`, and it still has the composer bug that ran codex
repos on Claude. Do **not** deploy the branch for the test. The proof runs on an
**isolated instance** built from `feature/codex-real-run` (own data dir, own port
5225, a throwaway git repo registered with engine codex; the live registry is only
read, never written):

```
cd C:\Users\Administrator\Desktop\playground\birocode
git checkout feature/codex-real-run
powershell -NoProfile -ExecutionPolicy Bypass -File .claudeweb-preview\codex-when-ready.ps1
```

`codex-when-ready.ps1` stops with `BLOCKED` (exit 2) while `codex login status`
says not logged in. Otherwise it builds the branch into `.selfdev-build\p3check\bin`,
rebuilds the client, and runs `.claudeweb-preview\codex-authenticated-e2e.ps1`.

## (c) What the first real test does and the evidence it leaves

`.claudeweb-preview\playwright\check-codex-authenticated.mjs` drives, through the
isolated harness's `POST /api/chat`:

1. a **builder turn** on the throwaway repo — "create hello.txt, commit it as
   'codex hello'" — expecting the thread id as the session event, `shell` tool
   events, `done` with no error, and a **new commit** in the repo;
2. a **resumed turn** on the same thread (`codex exec resume <id>`) that must recall
   the commit message;
3. an **ask-lane turn** that must not be able to write (`-c sandbox_mode="read-only"`);
4. an **MCP probe**: `codex exec --json` with the exact `-c mcp_servers.harness.*`
   overrides the adapter emits, pointing at `mcp-probe-server.mjs` (a
   dependency-free stdio MCP server with one tool), expecting an `mcp_tool_call`
   item and the probe's token in the answer.

The MCP probe stands in for "a harness repo tool" because the harness offers repo
agents no MCP tool of its own except Birokrat, which needs a Birokrat API key and
the `birokrat-ai-platform` checkout (neither is configured on this box), and the
arch's own tool endpoint is management-only, which the codex provider refuses by
design (no structural tool fence on Codex).

Evidence printed by the run: the SSE event list per turn, the harness log lines
(`[CHAT] Engine codex …`, `[CLI] Starting/Resuming session … (codex)`,
`[CODEX] Done: thread …`), `git log` of the repo (kept on success under
`%TEMP%\cw-codexauth-repo-*`), the feed's `turn.ended` events with `provider=codex`,
and the raw JSONL of the MCP run. Exit 0 = all green, 1 = a check failed, 2 = blocked.

## Unauthenticated evidence (already run, 17/17)

`.claudeweb-preview\codex-real-run-e2e.ps1` (port 5224) proves the clean failure path
and is the run behind the task report. It expects "not logged in" and becomes
meaningless once a credential exists.
