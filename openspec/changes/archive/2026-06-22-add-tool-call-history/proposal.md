# List the agent's tool-call history in the active conversation

## Why

While the agent works a turn, it makes a stream of **tool calls** — `Bash`, `Read`,
`Edit`, `Grep`, and so on. Today those calls are visible only as `steps` interleaved
inside each assistant message bubble, scattered through the transcript. There is no way
to answer the simple question "what has this agent actually *done* in this
conversation?" at a glance — you have to scroll the whole thread and mentally filter
tool steps out of the prose and thinking.

Worse, the history is **fragile**: the live `steps` live only in client memory for the
running turn. On a page reload or when reattaching to a session in progress, the
transcript is rebuilt from `GET /api/sessions/{id}/messages`, which **deliberately
strips** the `tool_use` / `tool_result` blocks (`SessionService.GetMessages`). So the
tool-call record effectively disappears — there is no backend surface that exposes it.

The End User needs a **consolidated, durable list of the tool calls** the agent made in
the currently active conversation, so they can audit and follow the agent's actions
independently of the message prose.

## What Changes

- Add a backend endpoint — **`GET /api/sessions/{id}/tools`** — that reconstructs the
  tool-call history of a session from the CLI JSONL transcript
  (`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`), pairing each `tool_use`
  block with its later `tool_result`. Each entry carries: `id`, `name`, a short
  `summary` of the input, an `ok` flag, a truncated output `preview`, and a
  `timestamp`. Mirrors the live SSE tool-event shape so the frontend can reuse its
  rendering.
- Add a frontend **slide-in "Tool calls" panel/drawer** in the chat view, toggled by a
  button, that lists every tool call in the active conversation in chronological order
  (name, summary, status icon, time), each row **expandable** to its full input/output.
  It is fed by the live `steps` while a turn streams and by the new endpoint on
  load/reattach, so the list stays complete across reloads.
- Gate the panel behind a **new `toolCallHistory` Advanced-mode capability**
  (`UiModeContext` `FEATURES`), defaulting to `'advanced'` per the repo convention.
- **i18n** strings for English and Turkish.

## Impact

- **Affected specs:** `tool-call-history` (new capability spec, seeded by this change's
  delta).
- **Affected code (new):** a tool-history extraction method on
  `ClaudeWeb.App/Services/Chat/SessionService.cs` (e.g. `GetToolCalls`), a new action
  on `ChatController` for `GET /api/sessions/{id}/tools`, and a new frontend panel
  component under `client/src/components/chat/` plus its toggle.
- **Affected code (edited):** `client/src/context/ChatContext.jsx` (expose/aggregate
  tool calls for the active conversation + fetch-on-load), `client/src/pages/Chat.jsx`
  (panel toggle + mount), `client/src/context/UiModeContext.jsx` (new gate),
  `client/src/i18n/en.json` + `tr.json`.
- **Reuses** the existing tool-event shape and the `ActivitySteps` rendering style
  where practical, rather than inventing a new representation.
- **Out of scope (deferred):** cross-session or global tool-call analytics / a
  multi-conversation dashboard; filtering/search within the list; exporting the
  history. v1 is "list the current conversation's tool calls, readably and durably."
