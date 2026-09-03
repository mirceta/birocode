# add-arch-tool-history

## Why

The arch agent works almost entirely through tool calls: every read of a repo, every
transcript it consults, every task it sends, every memory it writes is a harness tool
call (`add-arch-agent` fenced it that way on purpose). The Arch tab shows those calls
only as inline steps of the running turn and forgets them once the turn is over — the
transcript endpoint strips tool blocks, so after a reload nothing on the tab says what
the arch agent actually *did*, with which arguments, or what came back. The Tools lane
answers "what can it call" (the catalogue) and "how often" (audit counts), not "what
did it call, when, with what, and how did it go". The repo chat already has a durable
tool-call history (`tool-call-history`), reconstructed from the session transcript; the
arch conversation needs the same, but readable by a human at a glance: the arch tools
have a fixed vocabulary, so each call can be described in a sentence, its arguments
laid out as a table, its result parsed from the harness's own envelope.

## What Changes

- **New: a History lane on the Arch tab**, a sibling of Chat and Tools, listing every
  tool call of the arch conversation in order, grouped under the user message (Operator
  or wake-up) that caused it. Each call is a card: an icon and a plain-English sentence
  of what it did, the tool name and whether it is a harness tool or a built-in, a status
  (ok / error / running / no result), time and elapsed; opening the card shows the full
  arguments as a key/value table, the result parsed from the harness envelope (status,
  detail, data), and the raw call. Filters by tool, errors-only, free-text search,
  newest-first / oldest-first, expand / collapse all.
- **New: `GET /api/arch/tool-calls`** — the durable source: the arch session transcript
  reconstructed at full fidelity (complete input, result up to a budget with a clipped
  flag, both timestamps, elapsed, turn index and prompt, turn actor from the audit).
- **New: `SessionService.GetToolCallHistory`** — the generic full-fidelity reader
  beside the step-shaped `GetToolCalls`, usable by any conversation.
- **Modified: the live turn is overlaid** — while a turn runs, its tool steps from the
  stream merge into the lane by id, so a running call shows at once and settles when
  the transcript catches up.

## Capabilities

### Modified Capabilities

- `arch-agent`: the Arch tab gains a third lane; the tool-call history requirement.

## Impact

- Backend: `SessionService` (new reader + record), `ArchController` (new endpoint).
- Frontend: `ArchHistoryPanel.jsx` + `archHistory.css`, one lane button in `Arch.jsx`.
- No new persistence, no configuration, no change to what the arch agent can do.
