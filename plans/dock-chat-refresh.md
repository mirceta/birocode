# Dock chat refresh

> **Status (2026-06-15):** Shipped — built + browser-verified, merged to main.
> Not yet deployed. Branch `feature/dock-chat-refresh`.

## Goal

On the **agent dashboard** (the "wall of phones"), each agent dock embeds that
agent's live conversation (`PinnedAgent.jsx` → `<Chat embedded>`). Give each
dock a way to **refresh its conversation section** — re-pull the latest
transcript/events for that one agent from the backend run buffer, the same way
the dock already has a per-dock **git refresh** (`↻`) button.

This covers the case where a dock's chat looks stale (missed events, a turn
that rendered elsewhere, a reattach that didn't fire) and the user wants to
force that single conversation to reconcile without maximizing it or reloading
the whole page.

## Where it lives

- `client/src/context/ChatContext.jsx` — new `refreshOne(key, tabId, repoId,
  sessionId)`: a **single-key** version of `reconcile()` (reattach the run via
  `attachToRun` if live, else fix the badge + re-fetch the transcript). Exposed
  on the provider value and surfaced as `refresh()` from the `useChatFor()`
  facade.
- `client/src/pages/Chat.jsx` — renders a round `↻` button in the `chat__bar`
  next to **New**, **only when `refresh` is present** on the facade. The main
  app's `useChat()` doesn't expose `refresh`, so the button shows on dashboard
  docks only — no overlay, no collision with the chat's own header.
- `client/src/components/chat/chat.css` — `.chat__refresh` (round icon button +
  `chat-refresh-spin`).
- i18n: `chat.refresh` in `en.json` / `tr.json`.

## Approach (draft)

1. **Backend reuse first** — confirm the existing reattach path
   (`attachToRun` + `?after=N` seq watermark) can be invoked for a single
   conversation key without duplicating messages (the seq dedup at line ~223
   should make this safe). No new endpoint expected.
2. Expose `refresh()` from `useChatFor()` that runs the single-key reconcile.
3. Add a chat `↻` button to the dock (near the chat, distinct from the git one),
   with a spinning/disabled state while in flight, mirroring `gitRefreshing`.
4. Browser-verify on an isolated preview instance: stale a dock, click refresh,
   confirm the latest turn appears (per the test-in-browser convention).

## Slices

- **Slice 1** — per-key reconcile + the dock button + i18n + browser verify.

## Open questions

- Does refresh just re-pull events, or also re-run `reconcile()`'s run-detection
  (idle→running badge fix)? Lean toward the full single-key reconcile so a dock
  that's actually running gets re-attached, not just re-fetched.
