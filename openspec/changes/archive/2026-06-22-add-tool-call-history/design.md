# Design

## Context

A chat turn runs through `CliRunnerService`, which spawns the Claude CLI with
`--output-format stream-json` and translates each JSON line into the harness's stable
SSE contract. Tool activity is emitted as a three-phase event:

```
{type:"tool", id, name, status:"start"}
{type:"tool", id, name, status:"input", summary, detail}
{type:"tool", id, status:"end", ok, preview}
```

The frontend (`ChatContext.makeEventHandler` → `handleTool`) folds these into
`steps` of `kind:"tool"` inside the current assistant message, and `ActivitySteps.jsx`
renders each with a status icon, header (name + summary), and expandable detail/preview.

The durability gap: live `steps` exist only in client memory for the running turn. On
reload or reattach, the transcript is rebuilt from `GET /api/sessions/{id}/messages`
→ `SessionService.GetMessages`, which keeps only `type:"user"`/`type:"assistant"` text
and **drops** the nested `tool_use`/`tool_result` blocks. The raw record still exists
on disk in the CLI JSONL transcript (`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`),
where `tool_use` blocks sit in assistant `message.content[]` and the matching
`tool_result` blocks sit in a later user `message.content[]`, paired by `tool_use_id`.

The session id (per-repo UUID, also used for `--resume`) is the key to both the live
conversation and its JSONL file.

## Goals / Non-Goals

**Goals**
- A consolidated, chronological list of the tool calls in the **active conversation**.
- **Durable**: complete after reload and when reattaching to a running session — by
  reading the JSONL transcript on the backend, not relying on live client state.
- Reuse the existing tool-event shape and `ActivitySteps`-style rendering.
- Zero regression to live streaming or the existing transcript endpoint.

**Non-Goals**
- Cross-session / global tool-call analytics or a multi-conversation dashboard.
- Search, filter, or export within the list.
- Changing how tool steps render inline in the message stream.
- Persisting a *new* backend store — the JSONL transcript is the source of truth.

## Decisions

- **Reconstruct from the JSONL transcript, server-side.** Add a `GetToolCalls(workingDir, sessionId)`
  method on `SessionService` that walks the same JSONL `GetMessages` reads, but instead
  extracts `tool_use` blocks (id, name, input) from assistant messages and pairs each
  with its `tool_result` (ok, output) from the following user message by `tool_use_id`.
  This is the durable source and fills the real gap; no new persistent store is added.
- **A new read-only endpoint `GET /api/sessions/{id}/tools`** on `ChatController`,
  sibling to `/sessions/{id}/messages`, scoped by the active repo like the rest of the
  chat API. Returns `[{ id, name, summary, ok, preview, timestamp }]` — the same field
  shape the live SSE `tool` events carry, so the panel renders both sources uniformly.
  Input is summarized with the **same `ToolSummary` logic** used live (extract command /
  file_path / pattern), and output `preview` is truncated to the live limit (~800 chars).
- **Frontend data source = live + fetched, merged by `id`.** `ChatContext` already holds
  the live tool `steps` for the streaming turn; expose a selector that flattens them for
  the active conversation. On conversation load/reattach, fetch `/sessions/{id}/tools`
  and merge (dedupe by tool `id`) so the list is complete whether the turn is live,
  reattached, or fully historical.
- **UI = a slide-in side panel/drawer**, toggled by a button in the chat view, not a new
  route. Lists every tool call (name, summary, status icon, time), each row expandable to
  full input/output — reusing the `ActivitySteps` row presentation where practical.
- **New `toolCallHistory` capability gate**, defaulting to `'advanced'` (repo convention
  for new UI), added to `FEATURES` in `UiModeContext.jsx`; the toggle button and panel are
  hidden in Basic mode. (Unlike the Notes feature, this is *not* inside an already-gated
  surface, so it needs its own flag.)

## Risks / Trade-offs

- **JSONL parsing is coupled to the CLI's on-disk format.** `GetMessages` already depends
  on it, so this adds no *new* coupling, but the tool_use/tool_result pairing is more
  detailed. Mitigation: tolerate missing/partial fields (a `tool_use` with no matching
  `tool_result` shows as "no result / running"); never throw on a malformed line, skip it
  (mirrors `GetMessages`).
- **Two data sources (live steps + JSONL) can briefly disagree** mid-turn. Mitigation:
  merge by tool `id` with the live event winning while streaming; reconcile from the
  endpoint when the turn ends or on load.
- **Large transcripts** could make the list long. Accepted for v1 (current conversation
  only, no global aggregation); if needed later, cap/paginate — called out as a non-goal.

## Migration Plan

Additive only. New read-only endpoint + new frontend panel + new gate. No data
migration: the JSONL transcript already exists for every session; nothing is written.
The existing `/sessions/{id}/messages` behavior is unchanged.

## Open Questions

- Should the panel also show **thinking** steps, or strictly tool calls? v1 = tool calls
  only (the feature is "list tool calls"); thinking stays inline in the message stream.
- Should rows deep-link to the originating message bubble in the transcript? Deferred;
  nice-to-have, not required for v1.
