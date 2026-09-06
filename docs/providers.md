# Agent providers: Claude and Codex

The harness runs every agent turn through a provider adapter (openspec
`provider-agnostic-runner`, proven against the real CLI in openspec
`codex-real-run`). Two providers exist:

| provider | engine | status |
|---|---|---|
| `claude` | Claude Code CLI (`claude -p`, stream-json) | default; behaviour unchanged |
| `codex` | OpenAI Codex CLI (`codex exec --json`, headless; verified on codex-cli 0.153.4) | repo agents |

## Choosing a provider

- **Per repo agent** (persisted): the *Engine* selector in the agent's dock
  (Advanced mode), or `POST /api/repo/{id}/provider {"provider":"codex"}`.
  Stored on `repositories.json`; absent/unknown values read as `claude`.
- **Per turn** (override): `POST /api/chat {"provider":"codex", ...}`.
- Surfaced in `GET /api/repo` (`provider`), the dock, and the arch's
  `list_agents` (`provider` on local agents). The harness log names the engine
  of every non-default turn (`[CHAT] Engine codex for "<repo>"`) and every
  spawn (`[CLI] Starting new session in <dir> (codex)`).

The provider-neutral turn lifecycle (run record, busy/available slot, loops,
dispatch, wake-ups, transcripts, audit) is identical for both — a loop or an
arch dispatch on a codex repo runs codex turns (both pass the repo's provider).

## Codex setup on a machine

### 1. Install the CLI

`npm i -g @openai/codex` (or the standalone binary). The harness resolves
`codex` from PATH exactly like it resolves `claude` (real exe preferred over
the `.cmd` shim). A non-PATH install can be pinned in `appsettings.json`:

```json
{ "Providers": { "Codex": { "Path": "C:\\tools\\codex\\codex.exe" } } }
```

`GET /api/codex-account` (the dashboard's **Codex** chip) reports whether the
CLI was found and its version.

### 2. Where the credential goes — and how the runner picks it up

The harness stores **no** Codex credential and passes its environment through
untouched. Codex keeps its own login in

```
%CODEX_HOME%\auth.json        (when CODEX_HOME is set for the harness process)
%USERPROFILE%\.codex\auth.json (otherwise — for the live harness on this box:
                                C:\Users\Administrator\.codex\auth.json)
```

Every codex turn spawns `codex exec` **as the user the harness runs as**, so the
login that counts is that user's. `GET /api/codex-account` reports the exact
`home` directory in use and whether `codex login status` says logged in — the
Codex chip shows both.

Three ways to put a credential there, none of which involve a code change or
pasting the secret into a chat:

1. **Dashboard, API key** — expand the Codex chip, open *OpenAI API key*
   (Advanced mode, capability `codexKeyControl`), paste the key, *Log in*. The
   field is write-only and clears on submit; the harness POSTs it to
   `/api/codex-credentials`, which pipes it to `codex login --with-api-key` over
   the child's stdin (never argv, never an environment variable, never logged)
   and re-probes. Codex writes `auth.json` itself.
2. **Console on the box, ChatGPT plan** — as the harness user run `codex login`
   (browser flow) or `codex login --device-auth`; the chip flips to logged in
   on its next poll (the probe is cached for a minute).
3. **Console on the box, API key** — `printenv OPENAI_API_KEY | codex login
   --with-api-key` (or `echo %OPENAI_API_KEY% | codex login --with-api-key`).
   Setting `OPENAI_API_KEY` in the harness process's environment also works
   because the environment passes through, but it is invisible to the chip and
   to `codex login status`; prefer the login.

A turn without a credential fails cleanly: the thread id still arrives, the
CLI's transient "Reconnecting…" notices are logged (never shown as errors), and
one error carries the CLI's verdict (`unexpected status 401 Unauthorized …`).

## How the lanes and tools map (codex-cli 0.153.4)

- Builder lane → `codex exec --json --skip-git-repo-check
  --dangerously-bypass-approvals-and-sandbox … <prompt>` (the same "bounded only
  by the OS account" trust model as Claude's `--dangerously-skip-permissions`).
- Ask lane (read-only) → `-c sandbox_mode="read-only"`; the config override,
  because `codex exec resume` has no `--sandbox` flag and `-c` works on both.
- Session resume → `codex exec resume <threadId> …`; the thread id is stored as
  the conversation's session id.
- Stdin is redirected and closed at spawn: Codex otherwise appends anything on
  an inherited stdin to the prompt.
- Per-repo MCP tools (the dock Tools lane, the harness's own tool endpoint) →
  the same injected config, translated to `-c` overrides: stdio servers as
  `mcp_servers.<name>.command/args/env`; url servers as
  `mcp_servers.<name>.url` + `mcp_servers.<name>.bearer_token_env_var =
  'CLAUDEWEB_MCP_<NAME>_TOKEN'`, with the bearer token placed only in the
  child's environment (the keys `codex mcp add --url --bearer-token-env-var`
  writes).
- Events: `thread.started` → session; `item.*` (`item.type`: agent_message,
  reasoning, command_execution, file_change, mcp_tool_call, web_search) →
  token/thinking/tool; `turn.completed` → usage + done; `turn.failed` → error.
  `{"type":"error"}` events and `error` items are notices, not verdicts.
- Cost: Codex reports tokens, not USD — the run record's cost stays empty and
  the scoreboard counts the run's time, not spend.

## Deferred (Claude-only for now)

- **Management agents** (arch, Tasks): their structural tool fence
  (`--disallowedTools`) has no Codex equivalent, so a codex run carrying
  denials is refused rather than run unfenced.
- **Claude-in-Chrome**: `--chrome` has no Codex counterpart; browser mode
  only engages when the effective provider is claude.
- **Codex event-schema drift**: unknown JSONL events are logged and skipped —
  the turn still completes, with a quieter transcript.
