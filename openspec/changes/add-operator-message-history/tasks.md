# Tasks

## 1. Feature flag
- [ ] Add `operatorMessages: 'advanced'` to `FEATURES` in `client/src/context/UiModeContext.jsx`

## 2. Toolbar button
- [ ] In `client/src/pages/Chat.jsx`, add an "Operator messages" button beside `.chat__tools`, gated by `useFeature('operatorMessages')`
- [ ] Add `operatorsOpen` state and toggle; make it mutually exclusive with `toolsOpen` (opening one closes the other)

## 3. Panel component
- [ ] Add `client/src/components/chat/OperatorMessagesPanel.jsx` mirroring `ToolCallsPanel.jsx` (overlay, header with title + count + ✕ close)
- [ ] Aggregate the active conversation's `role === 'user'` messages (client-side over `conv.messages`); render them as user message bubbles
- [ ] Empty state when there are no operator messages

## 4. Styling
- [ ] Add sibling button/panel styles in `client/src/components/chat/chat.css` (reuse/parallel `.chat__tools*` and `.toolcalls__*`)

## 5. i18n
- [ ] Add `chat.operatorMessages` (+ empty/close labels) to `en.json` and `tr.json`

## 6. Verify
- [ ] Headless-browser check (per `docs/claude-web/browser-testing.md`): button beside Tool calls in Advanced, hidden in Basic; lists exactly the user messages with correct count; opening it closes the tool-calls panel

## 7. Understanding app
- [ ] Light update to `understanding-app/index.html` — the two sibling aggregators over one message stream
