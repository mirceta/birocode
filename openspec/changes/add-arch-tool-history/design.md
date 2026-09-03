# Design — add-arch-tool-history

## Context

The arch conversation is a CLI session like any repo chat's, so its tool calls are
already on disk as `tool_use` / `tool_result` blocks in the session `.jsonl` under the
arch home repo's projects folder. `SessionService.GetToolCalls` reconstructs them for
the repo chat's Tool calls panel, but in the *step* shape (input clipped to 1200
chars, result to 800 chars / 15 lines) because it mirrors the live stream. A human
reading the arch agent's history wants the opposite: the whole `send_task` text, the
whole `read_transcript` result, and a sentence that says what happened without
reading JSON.

## Goals / Non-Goals

**Goals**
- One lane where the Operator can answer "what did the arch agent do, with what, and
  how did it go" for the whole conversation, after any reload.
- Human-first rendering: sentence per call, arguments as a table, result parsed from
  the harness envelope, raw available but not default.
- Live calls visible at once (merged from the stream), durable calls authoritative.

**Non-Goals**
- No new persistence: the transcript is the record. No configuration.
- Not a replacement for the Tools lane (catalogue + counts) or the action audit.
- No cross-session history: the lane shows the arch conversation the tab shows.

## Decisions

- **D1 — a second reader, not a flag on the first.** `GetToolCallHistory` returns
  `ToolCallRecord` (full parsed `Input` as a JsonNode, `Result` up to 16 000 chars with
  `ResultClipped` + `ResultChars`, `At` / `ResultAt`, `Turn` / `TurnPrompt` / `TurnAt`).
  `GetToolCalls` keeps its step shape untouched so the repo chat panel is unaffected.
- **D2 — turns are derived from the transcript, actors from the audit.** A turn starts
  at a user line with visible text and no `tool_result` block. The endpoint restores
  each turn's actor (human | wake) with the same `MessageActors.Annotate` match the
  transcript endpoint uses, so the History lane and the Chat lane agree on who spoke.
- **D3 — the endpoint names the server.** `mcp__arch__x` is reported as `server: arch`,
  `tool: x`; anything else as `builtin`. The lane phrases harness tools from their
  fixed vocabulary and falls back to name + summary for built-ins.
- **D4 — live overlay by id, durable wins.** The lane merges the running turn's tool
  steps (same `useArchStream` turn the Chat lane renders) into the fetched list: a
  fetched call still running keeps a live spinner; a live-only call is grouped under
  a synthetic "now" turn until the transcript catches up. Polling at 3 s plus an
  immediate re-pull when the live turn ends.
- **D5 — newest first by default.** A review reads from the latest action back; a
  toggle gives chronological order. Cards are `<details>` so expand / collapse is
  native; "expand all" re-keys the cards.

## Risks / Trade-offs

- A very long conversation returns every call on each poll. Acceptable for the arch
  agent's volume (dozens to hundreds of calls); if it grows, paginate by turn.
- Result budget: 16 000 chars per result is generous but bounded; the lane says when
  it clipped and how long the real result was.
