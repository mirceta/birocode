# Design — local-app-overlay-keep-composer

## Context

In the agent dock (`client/src/components/dashboard/PinnedAgent.jsx`), the dock screen
(`.phone__screen`, a flex column) renders exactly one of: Event Console, Files browser, the
local app's `<ProductFrame>`, or the embedded `<Chat>` — a mutually exclusive conditional
(currently around lines 753–769). Opening any alternate view therefore **unmounts** the chat
entirely, composer included; there is no overlay/z-index involved.

The composer itself is `<ChatInput>` (`client/src/components/chat/ChatInput.jsx`), rendered as
the last flex child of `<Chat>` (`client/src/pages/Chat.jsx`). In the embedded dock case its
`position: fixed` styling is already overridden to in-flow (`dashboard.css` `.chat--embedded
.chat-input { position: static; flex: 0 0 auto; }`). All send/stop/queue logic lives in
`Chat.jsx` and its hooks — `ChatInput` is not usable standalone without rewiring that logic.

## Goals / Non-Goals

**Goals:**
- While any alternate view (local app, Event Console, Files browser) is open in the dock, show
  that view over the chat area but keep the composer strip visible and fully functional below
  it.
- Preserve chat state across opening/closing the view (no unmount): in-flight streaming
  continues, history/scroll state survives.

**Non-Goals:**
- No change to the standalone Local tab (`client/src/pages/LocalApp.jsx`).
- No change to the App tab, UI-mode gating, or any backend/API surface.
- No mini chat history / message peek while a view is open — composer only.

## Decisions

### 1. Keep `<Chat>` mounted in "composer-only" mode instead of extracting `ChatInput`

When any alternate view is active (`openApp`, `showConsole`, or `showFiles`), `PinnedAgent`
renders **both** children in the `.phone__screen` flex column: the alternate view
(`<ProductFrame>`, console, or files browser; flex: 1) followed by
`<Chat embedded composerOnly>` (flex: 0 0 auto). `Chat` gains a `composerOnly` prop that adds
a `chat--composer-only` class; CSS hides `.chat__bar` and `.chat__body` (and any overlays
anchored to them), leaving only `.chat-input` visible.

- **Why:** all send/stop/queue state lives in `Chat.jsx`; keeping it mounted gets a fully
  working composer for free and preserves streaming/history state across open/close — the
  spec's "state preserved" scenario falls out naturally.
- **Alternative — mount `<ChatInput>` standalone next to the frame:** rejected; requires
  extracting or duplicating the send pipeline (submit, stop, queueing, connection state) out of
  `Chat.jsx`, a much bigger and riskier refactor for the same visual result.
- **Alternative — absolutely position the alternate view over `.chat__body` only:** rejected;
  couples the view's geometry to chat-internal layout and z-index, fragile against the
  chat's own overlays (tool calls, operator messages).

### 2. Flex stacking, not overlay

The alternate view and the composer strip are siblings in the existing `.phone__screen` flex
column — the view takes the remaining height, the composer keeps its natural height. No
z-index or absolute positioning is introduced.

### 3. Hidden, not unmounted, chat chrome

`chat--composer-only` hides the bar/body with CSS (`display: none`) rather than skipping their
render, keeping `Chat.jsx` changes minimal and its internal refs/effects untouched. If an
effect turns out to misbehave against a `display: none` scroll container (e.g. autoscroll
measuring a 0-height list), guard that effect rather than unmounting.

### 4. One shared "alternate view active" condition for all three branches

All three branches — `openApp`, `showConsole`, `showFiles` — change from "view instead of
chat" to "view plus composer-only chat". The `<Chat embedded composerOnly>` element is rendered
once (driven by a single `altViewActive = openApp || showConsole || showFiles` condition), not
duplicated per branch, so the chat instance is stable when the operator switches directly
between views (e.g. Console → Files) and never remounts.

## Risks / Trade-offs

- [Chat effects assume a visible body (autoscroll, resize observers) and may warn or misbehave
  at `display: none`] → guard the affected effect(s) on the `composerOnly` prop; verify by
  streaming a turn while a view is open, then closing it.
- [Keeping Chat mounted while a view is open costs some background rendering during streams]
  → negligible for one dock; accepted for state preservation.
- [`.chat--embedded .chat-input` CSS assumptions (borders, radius) may look off when it is the
  only visible chat child] → add composer-only styling in `dashboard.css`; verify visually in
  the dock per `docs/claude-web/browser-testing.md`.
- [The Event Console / Files views may have their own bottom chrome (toolbars, action rows)
  that now sits directly above the composer] → check spacing/borders for each view during the
  visual pass so the stacked strips read as separate surfaces.
- [The maximize-chat toggle interacts with the alternate views] → composer-only mode wins while
  a view is open (the view occupies the screen either way); closing it returns to whichever
  layout state the dock had.
