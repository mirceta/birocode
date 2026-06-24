# Add an "Operator messages" button to the chat, beside "Tool calls"

## My understanding of the request (restated for confirmation)

**Goal.** The chat toolbar already has a **"Tool calls"** button that, when pressed,
opens a panel aggregating every tool call in the current conversation. Add a **second
button of the same kind right next to it** — **"Operator messages"** — that, when
pressed, renders **every message the operator (the `user` role) sent in this chat**,
in the same panel-overlay style the tool-calls button uses.

**Where this lives in the code (what I found):**

- The tool-calls button is in `client/src/pages/Chat.jsx` (~`:211`), in the `.chat__bar`
  toolbar after the model selector. It is `class="chat__tools"` (active:
  `chat__tools--on`), toggles a local `toolsOpen` boolean (`Chat.jsx:70`), and is gated
  by `showToolCalls = useFeature('toolCallHistory')` (`Chat.jsx:69`).
- The panel is `client/src/components/chat/ToolCallsPanel.jsx` — an absolute overlay
  (`.toolcalls`) filling `.chat__body`, with a header (title + count badge + ✕ close)
  and a body that renders `<ActivitySteps>`. Styles live in
  `client/src/components/chat/chat.css` (`.chat__tools*`, `.toolcalls*`).
- The data is already in the client: the active conversation's `conv.messages`
  (`ChatContext.jsx`) holds `{ role, text }` objects (assistant messages also carry
  `steps`). **Operator messages are simply `role === 'user'`** — no backend call is
  needed, unlike tool calls which merge a durable server fetch
  (`GET /sessions/{id}/tools`) because tool steps aren't in the loaded message list.
- The feature flag lives in `client/src/context/UiModeContext.jsx` (the Simple/Advanced
  capability map); tool calls is `toolCallHistory: 'advanced'`.

## Concrete steps I'll take (after you confirm)

1. **Feature flag.** Add `operatorMessages: 'advanced'` to `FEATURES` in
   `client/src/context/UiModeContext.jsx` (new UI features default to Advanced).
2. **Button.** In `Chat.jsx`, add a sibling button beside `.chat__tools`, gated by
   `useFeature('operatorMessages')`, toggling a new `operatorsOpen` boolean.
3. **Panel.** Add `client/src/components/chat/OperatorMessagesPanel.jsx`, mirroring
   `ToolCallsPanel.jsx` (same overlay/header/count/close), whose body lists the
   `role === 'user'` messages of the active conversation, rendered as message bubbles.
4. **One overlay at a time.** Opening one panel closes the other (both fill `.chat__body`).
5. **Styling.** Reuse `.chat__tools`/`.toolcalls__*` patterns in `chat.css` (shared or
   paralleled selectors) so the two buttons/panels look identical.
6. **i18n.** Add `chat.operatorMessages` (+ empty/close labels) to `en.json` and `tr.json`,
   alongside the `chat.toolCalls*` keys.
7. **Verify** in a headless browser (per `docs/claude-web/browser-testing.md`): button
   appears beside Tool calls in Advanced mode, hidden in Basic; clicking lists exactly
   the user messages with a correct count; opening it closes the tool-calls panel.
8. **Understanding app.** Light update to `understanding-app/index.html` showing the two
   sibling aggregators over one message stream (kept proportionate — this mirrors an
   existing feature).

## Open questions / assumptions (please confirm or correct)

- **A1 — Purely client-side over loaded messages.** I'll aggregate from the active
  conversation's already-loaded `conv.messages`, matching what's on screen. *(Alternative:
  also fetch `GET /sessions/{id}/messages` to guarantee the full session's operator
  messages even before scroll/reload — a durable mirror like tool calls. I don't think
  it's needed since user text is already in the message list, but say the word.)*
- **A2 — "Operator" = the `user` role.** Every `role === 'user'` message is an operator
  message; assistant/tool content is excluded. Confirm there's no other operator-message
  marker you have in mind.
- **A3 — Rendered as message bubbles** (reusing the chat's user-bubble styling), not raw
  text rows. *(Tool calls reuse `ActivitySteps`; the natural analogue for messages is the
  user bubble.)*
- **A4 — Mutually exclusive panels + Advanced-only**, consistent with tool calls.

## Why

The chat can get long, and an operator often wants to re-scan just *what they asked*
across a whole conversation — the same need the tool-calls aggregator serves for tool
activity. This adds the sibling view with zero new state or backend: the messages are
already loaded; we filter the one role.

## What changes

- `client/src/pages/Chat.jsx` — new gated "Operator messages" button + `operatorsOpen`
  state; mutual exclusion with `toolsOpen`.
- `client/src/components/chat/OperatorMessagesPanel.jsx` — new panel (mirrors `ToolCallsPanel`).
- `client/src/context/UiModeContext.jsx` — new `operatorMessages: 'advanced'` capability.
- `client/src/components/chat/chat.css` — sibling button/panel styling.
- i18n (`en.json`, `tr.json`) — new label keys.
- `understanding-app/index.html` — companion visualization.

## Impact

- Affected spec: **`operator-message-history`** (new capability — ADDED requirements,
  parallel to `tool-call-history`).
- Affected code: the client files above. **No server/API change** — operator messages
  are already in the loaded conversation.
