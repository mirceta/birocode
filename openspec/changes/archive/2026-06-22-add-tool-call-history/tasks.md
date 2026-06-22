# Tasks

## 1. Backend — reconstruct tool calls from the transcript

- [x] 1.1 Add `GetToolCalls(workingDir, sessionId)` to
      `ClaudeWeb.App/Services/Chat/SessionService.cs`: walk the same JSONL transcript
      `GetMessages` reads, extract `tool_use` blocks (id, name, input) from assistant
      messages, pair each with its `tool_result` (ok, output) from a later user message
      by `tool_use_id`; summarize input with the SAME `ToolSummary` logic used live and
      truncate the output `preview` to the live limit. Skip malformed lines, never throw.
- [x] 1.2 Return entries shaped like the live SSE `tool` event:
      `{ id, name, summary, detail, ok, preview, timestamp }`, in transcript order
      (added `detail` = full input so a row can expand to its input as well as output).
- [x] 1.3 Add `GET /api/sessions/{id}/tools` to
      `ClaudeWeb.App/Controllers/ChatController.cs` (repo-scoped, sibling of
      `/sessions/{id}/messages`) returning the list from 1.1.

## 2. Frontend — data wiring

- [x] 2.1 In `client/src/context/ChatContext.jsx`, `flattenToolCalls()` + `liveToolCalls`
      memo flatten the ACTIVE conversation's live tool `steps` into a chronological list;
      exposed alongside `activeRepoId` for the panel's scoped fetch.
- [x] 2.2 `ToolCallsPanel` fetches `GET /sessions/{id}/tools` on open / session change /
      turn end and merges with the live list, deduping by tool `id` (live wins).

## 3. Frontend — the panel

- [x] 3.1 `client/src/components/chat/ToolCallsPanel.jsx`: a slide-in drawer listing each
      call (name, summary, status icon, time), each row expandable to full input/output —
      reuses `ActivitySteps` for the row rendering. Styles in `chat.css`.
- [x] 3.2 Toggle button in `client/src/pages/Chat.jsx` (`.chat__tools` in `chat__bar`)
      opens/closes the panel; mounted for the active (non-embedded) conversation.

## 4. Gating + i18n

- [x] 4.1 Added `toolCallHistory: 'advanced'` to `FEATURES` in
      `client/src/context/UiModeContext.jsx`; toggle + panel gated with
      `useFeature('toolCallHistory')` (hidden in Basic mode).
- [x] 4.2 Added strings to `client/src/i18n/en.json` and `tr.json`
      (`chat.toolCalls`, `chat.toolCallsClose`, `chat.toolCallsEmpty`; Turkish ASCII).

## 5. Understanding app

- [x] 5.1 `understanding-app/index.html` visualizes the flow (toolbar toggle + drawer
      mock, Basic/Advanced gate, live-SSE + JSONL merge-by-id, the gap it fills).

## 6. Verify

- [x] 6.1 Backend builds clean; pairing logic validated against a real transcript
      (2560 tool calls, 2535 paired, 25 still-running → `ok: null`). Frontend builds clean.
- [x] 6.2 Browser: with a live turn, open the panel and watch calls appear; reload and
      reattach and confirm the history is still complete; rows expand to input/output;
      0 console errors. *(operator confirmed live: "it works".)*
- [x] 6.3 Confirm the toggle/panel is hidden in Basic mode and shown in Advanced mode.
      *(operator confirmed live.)*

## 7. Ship

- [x] 7.1 Build, deploy to live `:5099` via `swap.ps1` (origin/main guard), browser-verify.
      Deployed across three iterations (endpoint+drawer, overlay-toggle, dashboard docks);
      each health-checked 200 with the served asset matching the fresh build.
- [x] 7.2 Archive: delta folded into the `tool-call-history` baseline
      (`openspec/specs/tool-call-history/spec.md`); change moved to
      `changes/archive/2026-06-22-add-tool-call-history`; `feature/tool-call-history`
      merged into `main`.

## Post-archive refinements (operator follow-ups, same change)

- [x] R1 Panel renders as an in-place overlay over the chat message area, toggled by the
      same toolbar button (was a right-hand slide-in drawer).
- [x] R2 The overlay is also available in each Agent Dashboard dock, bound to that dock's
      own agent (`useChatFor` exposes `liveToolCalls`/`activeRepoId`; `ToolCallsPanel`
      takes them as props).
