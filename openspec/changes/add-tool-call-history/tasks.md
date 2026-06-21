# Tasks

## 1. Backend — reconstruct tool calls from the transcript

- [ ] 1.1 Add `GetToolCalls(workingDir, sessionId)` to
      `ClaudeWeb.App/Services/Chat/SessionService.cs`: walk the same JSONL transcript
      `GetMessages` reads, extract `tool_use` blocks (id, name, input) from assistant
      messages, pair each with its `tool_result` (ok, output) from a later user message
      by `tool_use_id`; summarize input with the SAME `ToolSummary` logic used live and
      truncate the output `preview` to the live limit. Skip malformed lines, never throw.
- [ ] 1.2 Return entries shaped like the live SSE `tool` event:
      `{ id, name, summary, ok, preview, timestamp }`, in transcript order.
- [ ] 1.3 Add `GET /api/sessions/{id}/tools` to
      `ClaudeWeb.App/Controllers/ChatController.cs` (repo-scoped, sibling of
      `/sessions/{id}/messages`) returning the list from 1.1.

## 2. Frontend — data wiring

- [ ] 2.1 In `client/src/context/ChatContext.jsx`, expose a selector that flattens the
      live tool `steps` for the ACTIVE conversation into a chronological tool-call list.
- [ ] 2.2 On conversation load/reattach, fetch `GET /sessions/{id}/tools` and merge with
      the live list, deduping by tool `id` (live event wins while streaming).

## 3. Frontend — the panel

- [ ] 3.1 Add a slide-in "Tool calls" panel/drawer component under
      `client/src/components/chat/` listing each call (name, summary, status icon, time),
      each row expandable to full input/output — reuse `ActivitySteps` row style where
      practical.
- [ ] 3.2 Add a toggle button in `client/src/pages/Chat.jsx` to open/close the panel and
      mount it.

## 4. Gating + i18n

- [ ] 4.1 Add a `toolCallHistory: 'advanced'` capability to `FEATURES` in
      `client/src/context/UiModeContext.jsx`; gate the toggle + panel with
      `useFeature('toolCallHistory')` (hidden in Basic mode).
- [ ] 4.2 Add the panel's strings to `client/src/i18n/en.json` and `tr.json`
      (Turkish ASCII, matching the file).

## 5. Understanding app

- [ ] 5.1 Update `understanding-app/index.html` to visualize the tool-call-history flow
      (SSE live steps + JSONL reconstruction → merged list → panel), per the repo
      convention for non-trivial work.

## 6. Verify

- [ ] 6.1 Backend: `GET /api/sessions/{id}/tools` returns the calls for a session,
      pairs results, and tolerates a malformed/partial transcript line.
- [ ] 6.2 Browser: with a live turn, open the panel and watch calls appear; reload and
      reattach and confirm the history is still complete; rows expand to input/output;
      0 console errors.
- [ ] 6.3 Confirm the toggle/panel is hidden in Basic mode and shown in Advanced mode.

## 7. Ship

- [ ] 7.1 Build, deploy to live `:5099` via `swap.ps1` (origin/main guard), browser-verify.
- [ ] 7.2 Archive: fold the delta into the `tool-call-history` baseline; merge
      `feature/tool-call-history` into `main`.
