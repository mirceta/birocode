# Tasks — add-arch-tool-history

## 1. Backend: the durable source

- [x] 1.1 `SessionService.GetToolCallHistory(workingDir, sessionId, maxResultChars)` + `ToolCallRecord`: full input as JSON, result up to the budget with clipped flag + real length, both timestamps, turn index / prompt / time; same resilience as `GetToolCalls` (malformed line skipped, unmatched call keeps `Ok = null`)
- [x] 1.2 `ArchController`: `GET /api/arch/tool-calls[?sessionId]` → `{ sessionId, calls, turns }`; harness tools split into `server: arch` + short `tool`, others `builtin`; `durationMs`; turns with prompt (clipped for display), time, call count and actor restored via `MessageActors.Annotate`

## 2. Frontend: the History lane

- [x] 2.1 `ArchHistoryPanel.jsx`: poll `/arch/tool-calls` (3 s, re-pull on live end), merge the live turn's tool steps by id, group by turn (newest first by default), per-call card (icon, sentence, tool + server chip, status pill, time + elapsed; arguments table, parsed envelope result with data, clipped note, raw call), filters (tool chips with counts, errors only, search, order, expand / collapse all), empty and error states
- [x] 2.2 `archHistory.css`: turn groups, cards, pills, spinner, mobile layout
- [x] 2.3 `Arch.jsx`: third lane button `🧾 History` beside Chat and Tools; renders the panel with the live turn and session id; `arch.css` scroll rule

## 3. Verification

- [x] 3.1 Unit test: a transcript with two turns, an arch tool call with a JSON envelope result, a built-in call with an error result, a call with no result, a malformed line → records carry full input, result, ok, turn index / prompt, timestamps; clipping flags a long result
- [x] 3.2 `check-arch-tab.mjs`: History lane against a routed `/api/arch/tool-calls` (two turns, wake + human actors, ok + error + no-result cards), the sentence per tool, expand shows the arguments table and the parsed envelope, filter chip narrows the list, errors-only, and a live running step overlaid from the stream
- [x] 3.3 `openspec validate add-arch-tool-history --strict` passes
