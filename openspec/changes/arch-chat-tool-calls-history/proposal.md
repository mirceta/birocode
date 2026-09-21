# Arch chat: tool calls stay after the reply; History loads the last 50

Board task `1b48cb5e09cd47a9849c41a54ead4479` (Operator, 2026-09-21). Two parts, one change.

## Part 1 — tool calls preserved in the conversation

**What happened.** While the arch agent runs, the page renders the live turn from the stream:
its thinking, its tool steps, its streamed reply. When the turn ends the page reloads the
transcript and hides the live turn as soon as the reloaded messages contain the reply. The
transcript endpoint (`GET /api/arch/messages`) returns text only — the reader strips
`tool_use` / `tool_result` blocks — so the tool steps vanished with the live turn. They were
never lost on disk (the History lane reads them from the same transcript), just never rendered
with the message again.

**What changes.** The transcript endpoint folds the tool-call history back onto the messages:
the calls of turn *k* (the *k*-th user message with visible text) ride with the first
assistant message that answered it, in the **same step shape the live stream renders**
(kind, name, status done/error, ok, summary, detail = the input, preview = the result,
startedAt, durationMs). The page renders those steps above every assistant bubble that carries
them, with the same `ActivitySteps` component the live turn uses — so a finished turn looks
exactly like it did while running. Pure and unit-tested (`ArchTranscriptViews.AttachToolCalls`
over the real readers on a crafted transcript; `stepsFromToolCalls` on the client). The extra
read is the cached tool-call history, so the transcript poll stays cheap.

## Part 2 — History defaults to the last 50

**What happened.** The lane fetched every tool call of the conversation and rendered every card
at once; a long conversation froze the app.

**What changes.** `GET /api/arch/tool-calls` takes `limit` (default **50** = the most recent
calls; `0` = all) and answers `total` and `truncated`. The lane asks for 50, says "showing the
last 50 of N — the filters below search only these", and offers **load 200 more** and
**load all N** (slow on purpose, on request). Every existing filter — the per-tool chips,
errors only, the search box, newest/oldest, expand/collapse all — stays exactly as it was,
applied to what is loaded.

## Out of scope

Server-side filtering (the lane's filters stay client-side over the loaded set); persisting
thinking blocks (the transcript has none to give); the repo chat, which keeps its separate
tool-calls drawer.
