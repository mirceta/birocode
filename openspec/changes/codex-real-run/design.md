# Design: codex-real-run

## D1 — Only `turn.failed` is terminal

The real stream interleaves `{"type":"error","message":…}` events and
`item.completed {item.type:"error"}` items before the turn either recovers or ends in
`turn.failed`. The adapter logs those as notices (`[CODEX] notice: …`) and remembers
the last one in `TurnSink.LastNotice`; it never calls `OnError` for them. `turn.failed`
still errors the turn with its own message (falling back to the last notice when the
event carries none). The runner's non-zero-exit path reads stderr, then `LastNotice`,
then a bare exit code — so a Codex process that dies without `turn.failed` still shows
the Operator the real reason.

## D2 — One read-only spelling for both subcommands

`codex exec` has `--sandbox`, `codex exec resume` does not; both accept `-c`. The ask
lane is therefore always `-c sandbox_mode="read-only"` (`CodexCliAdapter.ReadOnlyOverride`),
verified on the real binary (a resume with that argv fails on the thread lookup, i.e.
past argument parsing). The builder lane stays
`--dangerously-bypass-approvals-and-sandbox`, present on both subcommands.

## D3 — url MCP servers: url + bearer_token_env_var, token in the child's environment

`codex mcp add <name> --url <url> --bearer-token-env-var <VAR>` writes exactly
`mcp_servers.<name>.url` and `mcp_servers.<name>.bearer_token_env_var` to config.toml
(captured on 0.153.4), so the adapter emits those two `-c` overrides for a url server
whose injected config carries `Authorization: Bearer <token>`. The variable is named
`CLAUDEWEB_MCP_<NAME>_TOKEN` and its value is set on the child's `ProcessStartInfo`
environment only — the token never appears on argv (process listings) and the temp
config file is still deleted at turn end. Other headers are dropped with a log line
(no verified per-header override exists).

## D4 — Stdin is redirected and closed

Codex reads a piped stdin as additional prompt input. The adapter sets
`RedirectStandardInput`; `CliRunnerService` closes the stream right after `Start()` for
any adapter that redirects it (Claude does not, so its behaviour is untouched).

## D5 — The provider travels with the repo on every turn source

`AutopilotService` (loops) and `ArchAgentService.StartRepoTurn` (arch dispatch) pass
`repo.Provider`; management homes (arch, Tasks) pass none and stay claude. The
ChatController path resolved the provider correctly but read it off a clone that had
lost it: `RepositoryRegistry.Clone` now copies `Provider` and `Handle` (pinned by a
test), and the controller logs `[CHAT] Engine codex for "<repo>" (repo setting |
turn override)` so a transcript shows which engine a turn resolved to.

## D6 — Credential: ask the CLI, hand the key to the CLI

Codex owns its secret store (`%CODEX_HOME%\auth.json`, default
`%USERPROFILE%\.codex\auth.json`) and the runner passes the environment through, so the
credential the harness's turns use is whatever the CLI is logged in with *as the user
the harness runs as*. `CodexAccountService` probes `codex --version` and
`codex login status` (exit 0 = logged in; "Not logged in" + exit 1 otherwise), memoised
one minute, and reports the home directory so the chip can tell the Operator where the
credential goes. `CodexCredentialsService` pipes a pasted key to
`codex login --with-api-key` over stdin (the same shape as the GitHub PAT control),
scrubs the key from any error text, and re-derives the outcome by re-probing.
ChatGPT-plan logins (`codex login`, device auth) remain a console action by the Operator
on the box; the chip then simply shows them as logged in.

## Testing

`CodexRealRunTests` pins: argv + stdin redirect; the ask-lane override on resume; the
url MCP translation with the token only in the environment; the verbatim unauthenticated
stream (notices never error, one error on `turn.failed`, thread id captured); `item.type`
items; the real `codex login status` outcomes. `check-codex-runner.mjs` on an isolated
instance drives a builder turn on a throwaway codex repo through the real binary and
asserts the clean failure path, provider on turn.start/turn.ended, and the log lines.
