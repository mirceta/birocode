# M5: Frontend Chat UI

**Blocked by:** M1 (CLI Runner API), M4 (App Shell)
**Blocks:** nothing

## Goal

The chat screen. This is the most important screen in the app and
the one where UX polish matters most.

Native clients (ChatGPT, Gemini) set the bar with polished streaming,
typing indicators, and tool-use feedback. See ANALYSIS.md "Chat UX"
section for the full breakdown of what they do well.

## Files You Own

- `client/src/pages/Chat.jsx` -- replaces M4's placeholder
- `client/src/components/chat/` -- all chat components:
  - `MessageBubble.jsx` -- single message (user or assistant)
  - `ChatInput.jsx` -- text input + send button
  - `ThinkingIndicator.jsx` -- shown while Claude processes
  - `ToolStatus.jsx` -- "Editing document...", "Reading file..."
  - `SessionPicker.jsx` -- list/select previous sessions

## What to Build

- **Message list:** user messages right-aligned, assistant left-aligned
- **Chat input** with send button, fixed at bottom above nav bar
- **Streaming response:** render tokens as they arrive via SSE
  - Connect to POST /api/chat, read the SSE stream
  - M1 sends a STABLE event contract (you do NOT parse raw CLI output):
    - `{type:"session", sessionId}` -- save for resume
    - `{type:"token", text}`        -- append to current assistant bubble
    - `{type:"tool", name, status}` -- show tool-use status line
    - `{type:"thinking"}`           -- show "thinking..." state (optional)
    - `{type:"done", sessionId, cost}` -- finalize the message
    - `{type:"error", message}`     -- show error
  - See plans/M1-cli-runner.md "Verified CLI Contract" for the full
    picture of what the backend translates from.
- **Markdown rendering** in assistant messages
  - Use react-markdown or similar library
  - Must render: headers, lists, bold/italic, code blocks, links
- **Thinking indicator** -- animated dots or spinner, shown after
  user sends a message and before the first token arrives. Can also be
  driven by the `{type:"thinking"}` SSE event from M1.
- **Tool-use feedback** -- driven by `{type:"tool", name}` SSE events
  from M1, shown as a status line (e.g., "Editing document...",
  "Reading file..."). Map tool names to friendly labels: Write/Edit ->
  "Editing document...", Read -> "Reading file...", Bash -> "Working...".
- **Session management:**
  - List previous sessions (GET /api/sessions)
  - Tap a session to continue it (POST /api/chat with sessionId)
  - "New conversation" button to start fresh (no sessionId)
- **Auto-scroll** during streaming, stop if user scrolls up manually

## Priority Order

1. [must] Streaming render -- tokens appear as they arrive
2. [must] Markdown rendering -- headers, lists, bold, code blocks
3. [must] Thinking indicator -- user knows Claude is processing
4. [should] Tool-use feedback -- user sees what Claude is doing
5. [should] Auto-scroll with manual override
6. [nice] Send animation / haptic feedback on mobile

## API Calls

- `POST /api/chat` -- SSE stream (see M1 plan for event format)
- `GET /api/sessions` -- JSON array of session metadata

## Verify

- Open on phone viewport (375px)
- Type a message and send -- response streams in word by word
- Markdown renders correctly (send "write a list of 3 items")
- Thinking indicator appears between send and first token
- Start a new conversation
- Continue an existing session from the session list
- During streaming, scroll up -- auto-scroll stops
- During streaming, scroll back to bottom -- auto-scroll resumes

## Do Not Touch

- `client/src/pages/Files.jsx` or `client/src/components/files/` (M6)
- `client/src/pages/History.jsx` or `client/src/components/history/` (M7)
- `client/src/layout/` (M4 -- use it, don't modify it)
- Any files under `ClaudeWeb.App/` (M1, M2, M3)
