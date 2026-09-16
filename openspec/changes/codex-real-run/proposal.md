# Prove the Codex runner for real: credential plumbing + the real CLI's shapes

## Why

`provider-agnostic-runner` (PR #78) built the Codex adapter against the documented
`codex exec --json` contract without a Codex CLI on the box. Board task
9aaf5da215254a858079bbe13f51247c asks for proof against the real thing: detect what is
installed, let the Operator drop a Codex credential in through the harness's existing
settings mechanism (no code change, no secret in any chat or log), run a repo agent on
codex end to end, and fix whatever the real binary breaks.

Running codex-cli 0.153.4 on this box (installed for this change) showed six gaps in
the assumed contract:

1. transient `{"type":"error"}` events ("Reconnecting... 2/5", "Falling back from
   WebSockets to HTTPS") were treated as terminal errors — a turn would error out and
   record the first reconnect notice, not the real verdict;
2. `item.completed` carries `item.type`, not `item_type`, and an item of type `error`
   exists;
3. `codex exec resume` has no `--sandbox` flag (the ask lane on resume would not parse);
4. url MCP servers (the harness's own tool endpoint) were skipped although Codex
   supports `mcp_servers.<name>.url` + `bearer_token_env_var`;
5. Codex appends an inherited stdin to the prompt ("Reading additional input from
   stdin...") — stdin was not redirected/closed;
6. loops and arch dispatch never passed the repo's provider, so a codex repo ran claude
   turns whenever it was not driven from the composer;
7. worse, the composer path did too: `RepositoryResolver.Current()` hands the chat
   controller a `RepositoryRegistry.Clone(...)` that dropped `Provider` (and `Handle`),
   so a repo whose engine was codex still ran Claude — the first real-binary run in this
   change ran (and billed) a Claude turn on a repo registered as codex.

There was no Codex credential mechanism at all: nothing to tell the Operator whether the
CLI is logged in, and no in-app way to log it in.

## What Changes

- **Codex adapter fixes** for every gap above; argv, MCP overrides and event shapes are
  pinned by tests to the real 0.153.4 shapes captured on this box.
- **Credential plumbing** mirroring the GitHub token control: `GET /api/codex-account`
  (a `codex login status` probe: installed, version, authenticated, login method, and
  the home directory the credential lives in) and `POST /api/codex-credentials
  { apiKey }` (piped to `codex login --with-api-key` over stdin, never argv/env, never
  logged, result re-derived by re-probing). A Codex chip beside the GitHub and Claude
  chips, with a write-only key field (feature flag `codexKeyControl`).
- **Provider on every turn source**: loops and arch dispatch pass the repo's provider.
- **Docs**: `docs/providers.md` states exactly where the credential goes and how the
  runner picks it up.

## Impact

- Code: `CodexCliAdapter`, `CliRunnerService` (stdin close, last-notice fallback),
  `TurnSink.LastNotice`, `AutopilotService`/`ArchAgentService` call sites,
  `CodexAccountService`, `CodexCredentialsService`, `CodexCredentialsController`,
  `AccountsController`, `AccountsModuleExtensions`, `AccountChips.jsx`,
  `CodexKeyControl.jsx`, i18n, `UiModeContext` flag.
- Specs: `chat` (Codex turns against the real CLI), new `codex-credentials`.
- Not in scope: the authenticated end-to-end run (turn → MCP tool call → commit). It
  needs a credential that does not exist on this machine; the task ends BLOCKED naming
  exactly what the Operator must provide and where.
