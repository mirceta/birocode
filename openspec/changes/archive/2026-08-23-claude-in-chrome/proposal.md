# claude-in-chrome — drive the operator's real Chrome from harness chat runs

## Why

Claude Code now ships a built-in browser integration: `claude --chrome` connects to the
Claude in Chrome extension over a native-messaging host and exposes it as an MCP server
(`claude-in-chrome`). Unlike Playwright, it drives the **operator's real Chrome profile** —
live cookies, SSO/MFA sessions, password manager — inside a visibly-scoped tab group, so an
agent can work logged-in surfaces (Gmail, CRMs, internal tools behind Okta) with no API
connectors and no credential handling. The Harness already runs every agent turn as
`claude -p` (CliRunnerService), which is exactly the shape the integration supports, so the
End User on their phone could ask Claude to do real browser work on the host PC. Today the
Harness never passes `--chrome`, so this capability is invisible to it.

## What Changes

- Chat runs gain an opt-in **browser mode**: when enabled for a session, the spawned CLI
  gets `--chrome` (and whatever tool-allow shape the design settles on), so the agent's
  toolset includes `mcp__claude-in-chrome__*` alongside its normal repo tools — one session
  that can edit code *and* verify it in the real browser.
- **Serialization guard**: the native-messaging pipe is effectively single-holder. The
  Harness must ensure at most one browser-enabled run is active at a time (across all repos
  and prompt threads) and queue or refuse the rest with a clear message.
- **Status surface**: show whether the Chrome extension is reachable and which
  Chrome/tab-group a browser session owns, so the Operator knows which window is the
  agent's. (Window placement is not programmable — a new group opens a new window; the
  sanctioned fix is the Operator dragging the group, which the UI should explain.)
- **Preconditions surfaced, not assumed**: extension ≥ 1.0.36 and subscription (`/login`)
  auth are hard requirements — API-key auth silently disables the integration. The Harness
  already strips `ANTHROPIC_API_KEY` from the child env, which satisfies this; the status
  surface should still report "browser unavailable + why" instead of failing silently.
- **Session-lifetime question made explicit**: Harness turns are fresh `-p` processes
  resuming a session id. Whether a resumed run re-attaches to the same tab group (stable
  window) or negotiates a new one each turn is *the* load-bearing unknown; the design phase
  must verify it empirically before any UI is built.

## Capabilities

### New Capabilities
- `claude-in-chrome`: browser-enabled chat runs — enabling/disabling browser mode per
  session, the `--chrome` spawn contract, the single-holder serialization rule, extension
  reachability/status reporting, and operator guidance for window/tab-group handoff.

### Modified Capabilities
- `chat`: a chat session gains a browser-mode option that changes the spawn contract of its
  runs (`--chrome` present, browser MCP tools available) and constrains concurrency
  (browser-enabled runs are serialized).

## Impact

- **Code**: `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` (spawn args, display
  command), chat session state (per-session browser flag), a small status service/endpoint
  for extension reachability; `client/` chat UI for the toggle + status pill. New UI
  defaults to **Advanced** mode per the UI-modes convention
  (`client/src/context/UiModeContext.jsx`).
- **Host requirements**: Chrome with the Claude in Chrome extension ≥ 1.0.36 on the host
  PC, CLI signed in via subscription. Not available under WSL/Bedrock/Vertex — Harness on
  native Windows is fine.
- **Security**: browser mode runs with the builder lane's `--dangerously-skip-permissions`,
  which extends "fully trusted" from the repo to the Operator's logged-in browser. The
  browser flag must therefore sit behind the existing auth gates and be per-session opt-in,
  never a default; read-only ("ask") lane runs must not get `--chrome`.
- **Docs**: the agent-facing handoff (how to address tabs by URL, batch/tabId traps,
  service-worker idle death) belongs in a `docs/` convention file the design phase places.
