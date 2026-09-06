# Agent providers: Claude and Codex

The harness runs every agent turn through a provider adapter (openspec
`provider-agnostic-runner`). Two providers exist:

| provider | engine | status |
|---|---|---|
| `claude` | Claude Code CLI (`claude -p`, stream-json) | default; behaviour unchanged |
| `codex` | OpenAI Codex CLI (`codex exec --json`, headless) | repo agents (vertical slice) |

## Choosing a provider

- **Per repo agent** (persisted): the *Engine* selector in the agent's dock
  (Advanced mode), or `POST /api/repo/{id}/provider {"provider":"codex"}`.
  Stored on `repositories.json`; absent/unknown values read as `claude`.
- **Per turn** (override): `POST /api/chat {"provider":"codex", ...}`.
- Surfaced in `GET /api/repo` (`provider`), the dock, and the arch's
  `list_agents` (`provider` on local agents).

The provider-neutral turn lifecycle (run record, busy/available slot, loops,
dispatch, wake-ups, transcripts, audit) is identical for both — a loop or an
arch dispatch on a codex repo simply runs codex turns.

## Codex setup on a machine

1. Install the Codex CLI (`npm i -g @openai/codex`, or the standalone binary).
   The harness resolves `codex.exe` from PATH exactly like it resolves
   `claude.exe` (real exe preferred over the `.cmd` shim). A non-PATH install
   can be pinned in `appsettings.json`:

   ```json
   { "Providers": { "Codex": { "Path": "C:\\tools\\codex\\codex.exe" } } }
   ```

2. Authenticate the CLI itself: `codex login` (ChatGPT plan) or set
   `OPENAI_API_KEY` in the harness's environment. The harness stores no Codex
   credential and passes the environment through untouched — the same contract
   as `gh` for GitHub.

## How the lanes and tools map

- Builder lane → `--dangerously-bypass-approvals-and-sandbox` (the same
  "bounded only by the OS account" trust model as Claude's
  `--dangerously-skip-permissions`).
- Ask lane (read-only) → `--sandbox read-only`.
- Session resume → `codex exec resume <threadId>`; the thread id is stored as
  the conversation's session id.
- Per-repo MCP tools (the dock Tools lane) → the same injected config,
  translated to `-c mcp_servers.<name>.command/args/env` overrides. stdio
  servers only for now; `url` servers are skipped with a log line.
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
