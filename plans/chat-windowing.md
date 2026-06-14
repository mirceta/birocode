# Chat windowing — render only the tail of long conversations

> **Status (2026-06-14):** PROPOSED — not started. New feature on
> `feature/chat-windowing`. Frontend-only; no backend or transcript changes.

## Problem

The chat surface renders **every** message in the conversation: `Chat.jsx`
does `messages.map(...)`, and each turn mounts a full `MessageBubble` (markdown
+ syntax highlight) plus `ActivitySteps`. Cost grows linearly with history, so a
long conversation makes the whole app sluggish — typing, scrolling, and each
streaming tick re-touch a DOM with hundreds of heavy bubbles. In practice **we
almost never scroll up**: the live tail is what matters.

## Goal

Keep long chats fast by rendering only the **recent tail** of messages by
default, while still letting the user reach older history on demand. The fix is
about render cost, not data — the full transcript stays in memory/state and on
the backend untouched.

## Design

- **Cap the rendered window.** Render only the last `N` messages (initial
  proposal `N = 50`, tunable). Older messages stay in the `messages` array but
  are not mounted.
- **"Show earlier messages" affordance.** When `messages.length > N`, show a
  button/sentinel at the top of the scroll area that reveals an older chunk
  (e.g. +50) per click — or auto-reveals when the user scrolls to the top.
  Reaching the very top eventually renders the whole history (escape hatch for
  the rare scroll-up).
- **Tail-follow unaffected.** New messages and streaming always fall inside the
  window, so the existing auto-scroll-to-bottom behavior is unchanged. Sending a
  message or starting a new turn resets the window to the tail.
- **Keys.** The current `key={i}` (array index) is fine for an append-only tail
  but breaks once we slice off the front — switch to a stable per-message key so
  React doesn't remount the window when the offset changes.

## Open questions / decisions to confirm

- **Window size `N`** and reveal chunk size — start at 50/50, revisit after
  measuring.
- **Reveal mechanic** — explicit "Show earlier" button vs. auto-load on
  scroll-to-top. Button is simpler and more predictable; lean that way for
  slice 1.
- **Virtualization vs. windowing** — a full windowing/virtualization library
  (e.g. react-window) would cap cost even with all history revealed, but adds a
  dependency and fights variable-height markdown bubbles. Start with the simple
  tail-cap; only reach for virtualization if revealed-history perf still bites.

## Slices

- **Slice 1** — tail-cap render (`N` most recent) + "Show earlier" button +
  stable keys + tail-reset on send. Frontend-only, in `Chat.jsx`.
- **Slice 2 (later, if needed)** — true virtualization of the revealed history.

## Verification

Browser test (`docs/claude-web/browser-testing.md`): open a conversation with
many messages (seed a long transcript), confirm only the tail renders (count
mounted bubbles), that "Show earlier" reveals older chunks, that sending a
message snaps back to the tail, and — the point of the feature — that scrolling
and typing stay responsive on a long chat. Compare mounted-bubble count
before/after.
