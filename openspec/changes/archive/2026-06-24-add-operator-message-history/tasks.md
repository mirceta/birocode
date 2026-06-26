# Tasks

## 1. Feature flag
- [x] Add `operatorMessages: 'advanced'` to `FEATURES` in `client/src/context/UiModeContext.jsx`

## 2. Toolbar button
- [x] In `client/src/pages/Chat.jsx`, add an "Operator messages" button beside `.chat__tools`, gated by `useFeature('operatorMessages')`
- [x] Add `operatorsOpen` state and toggle; make it mutually exclusive with `toolsOpen` (opening one closes the other)

## 3. Panel component
- [x] Add `client/src/components/chat/OperatorMessagesPanel.jsx` mirroring `ToolCallsPanel.jsx` (overlay, header with title + count + ✕ close)
- [x] Aggregate the active conversation's `role === 'user'` messages (client-side over `conv.messages`); render them as user message bubbles
- [x] Empty state when there are no operator messages

## 4. Styling
- [x] Add sibling button/panel styles in `client/src/components/chat/chat.css` (reuse/parallel `.chat__tools*` and `.toolcalls__*` via grouped selectors)

## 5. i18n
- [x] Add `chat.operatorMessages` (+ empty/close labels) to `en.json` and `tr.json`

## 6. Verify
- [x] Headless-browser check (Playwright against an isolated preview on :5312, fresh datadir): button beside Tool calls in Advanced (hidden in Basic); panel lists exactly the user messages (1 user shown, 6 assistant excluded) with correct count badge; opening it closes the tool-calls panel; no console errors

## 7. Understanding app
- [~] Skipped intentionally: this is a faithful mirror of the existing tool-calls drawer (trivial), and the `understanding-app/` slot currently hosts the OpenSpec-flow explainer the operator explicitly requested. Not overwriting it for this small feature.
