# Add a prompt-expand popup to the chat composer

## Why

The chat composer (`client/src/components/chat/ChatInput.jsx`) is a single auto-growing
`textarea`. It grows to fit content, but on a phone it is still pinned to the bottom of the
screen behind the keyboard, the page header, and the streaming reply — so a long, multi-part
prompt renders as a cramped sliver. When the End User wants to say a lot in one turn, they
cannot comfortably read back, restructure, or proofread what they have written before sending.

We want a way to inspect and edit the **current draft** in a large, distraction-free window,
then drop straight back into the composer — without sending, losing, or duplicating anything.

## What Changes

- **Expand button on the composer** — a new toolbar button in the `chat-input__row` that
  opens a large editor popup for the current draft. Available on the main composer and the
  dashboard docks (same surfaces as the ⚙ Prompts button).
- **Prompt-expand popup** — a modal (portaled to `<body>`, like `PromptManager`) holding one
  large `textarea` bound to the **same draft** the composer edits. Edits are live and
  two-way: the draft lives in `ChatContext` (`value`/`onChange`), so the popup is just a
  second, bigger view of it — nothing to merge or copy on close.
- **Close to return** — closing the popup (button, backdrop click, or Esc) leaves the edited
  draft in the composer, ready to send as a normal turn. The popup never sends and never
  clears the draft.
- **UI-mode capability** — registered in `client/src/context/UiModeContext.jsx` as a new
  capability, defaulting to **Advanced** per the repo convention.
- **i18n** — new label/aria strings for the expand button and popup, added to the language
  catalog like the other `chat.*` strings.

## Impact

- **Specs:** `chat` — adds one requirement (expand the draft in a large popup).
- **Code:** `client/src/components/chat/ChatInput.jsx` (new button + popup wiring),
  a new popup component under `client/src/components/chat/`, `client/src/components/chat/chat.css`
  (popup styles), `client/src/context/UiModeContext.jsx` (capability), the i18n catalog.
- **No backend change** — the draft is already client-side state; nothing crosses the wire.
- **Non-goals:** no change to send/stop/queue/attachment behavior; no fullscreen mode for the
  whole chat; no rich-text/markdown editing — plain text only, same as today.
