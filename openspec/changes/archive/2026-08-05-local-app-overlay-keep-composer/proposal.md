# Alternate dock views keep the chat composer visible

## Why

When the operator opens a local app (e.g. the Understanding app), the Event Console, or the
Files browser from an agent dock, that view replaces the entire dock screen — including the
chat composer. To tell the agent what to change, the operator must close the view, losing sight
of it exactly when they have just spotted what's wrong. Keeping the small composer strip
(prompt box + Send) visible below the view lets the operator look at the app, console, or files
and type the next instruction at the same time.

## What Changes

- In the agent dock (dashboard "phone"), opening any of the three alternate views — a local
  app, the Event Console, or the Files browser — renders that view over the chat's bar and
  message area **but leaves the chat composer visible and usable** at the bottom of the dock
  screen.
- Only the composer strip stays — not the chat history. The message list, chat toolbar/bar, and
  other chat chrome are covered by the alternate view while it is open.
- Sending a prompt from the composer while an alternate view is open works exactly as when the
  chat is shown normally (same send/stop behavior, queueing, etc.); the view stays open across
  the send.
- Closing the alternate view restores the full chat view unchanged.
- Scope is the agent dock only. The standalone Local tab keeps its current full-screen
  behavior.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `agent-dock`: add a requirement that the dock's alternate views (local app, Event Console,
  Files) keep the chat composer visible and functional beneath the view, instead of covering
  the whole dock screen.

## Impact

- **Frontend only; no backend/API changes.**
- `client/src/components/dashboard/PinnedAgent.jsx` — the dock currently swaps the alternate
  view (`<ProductFrame>`, Event Console, or Files browser) in **instead of** the embedded
  `<Chat>` inside `.phone__screen` (unmounting the chat and its composer). This
  mounting/layout changes so the chat's composer remains mounted while any alternate view is
  open.
- `client/src/pages/Chat.jsx` / `client/src/components/chat/ChatInput.jsx` — likely a
  "composer-only" presentation of the embedded chat (chat stays mounted so send/stream state
  is preserved; bar and body hidden while the alternate view covers them).
- `client/src/pages/dashboard.css` / `client/src/components/chat/chat.css` — layout rules for
  the dock screen (alternate view above, composer strip below).
- UI-mode gating unchanged: the behavior lives behind the existing `localAppTab` capability in
  `client/src/context/UiModeContext.jsx`; no new capability-map entry needed.
