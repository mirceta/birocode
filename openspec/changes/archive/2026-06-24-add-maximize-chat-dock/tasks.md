## 1. Per-dock maximize state (PinnedAgent)

- [x] 1.1 Add ephemeral `chatMaximized` boolean state (`useState(false)`) to `PinnedAgent.jsx`, plus a `toggleChatMaximized` callback
- [x] 1.2 Apply a `phone--chat-max` modifier class to the root `.phone` element when maximized (do NOT remount the `<Chat>` subtree)
- [x] 1.3 Pass `chatMaximized` and `toggleChatMaximized` down into the embedded `<Chat>` (only in the dock/embedded context, chat lanes only)

## 2. Toggle button (Chat toolbar)

- [x] 2.1 In `Chat.jsx`, render the maximize-chat toggle button in `.chat__bar` immediately next to `.chat__tools`, gated on the toggle props being present
- [x] 2.2 Wire `aria-pressed`, an active modifier class (`chat__maximize--on`), and `onClick={toggleChatMaximized}`; use i18n title/aria-label that reflects the maximize vs restore state

## 3. Layout CSS

- [x] 3.1 Add CSS so `.phone--chat-max` hides the non-chat chrome (`.phone__bar`, `.phone__lanes`, `.phone__apps`, `.phone__git`, `.phone__discover`) so `.phone__screen` (and the chat within) fills the dock
- [x] 3.2 Style the button's active/pressed state (`.chat__maximize--on`), matching the Tool Calls button's visual pattern
- [x] 3.3 Confirm the composer (`.chat-input`) and chat toolbar stay visible and usable while maximized

## 4. i18n

- [x] 4.1 Add the toggle label/aria keys (e.g. `chat.maximizeChat` / `chat.restoreChat`) to `client/src/i18n/en.json` and `client/src/i18n/tr.json`

## 5. Verify

- [x] 5.1 Build the frontend (`npm --prefix client run build`)
- [x] 5.2 Browser-verify on an isolated preview port with Playwright: maximize hides chrome + chat fills dock; same button restores; per-dock isolation (one dock max'd, others unaffected); composer + both toolbar buttons clickable while maximized; screenshot both states
- [x] 5.3 Run `openspec validate add-maximize-chat-dock --strict` and confirm it passes
