# Dashboard chat cut off — can't scroll to the composer

> **Status (2026-06-14):** FIXED — built & browser-verified
> (`verify-dashboard-chat-scroll.mjs` 6/6: composer sits within the phone frame,
> bounded scroll area scrolls a 96k-px transcript, composer reachable after
> scrolling). Frontend-only CSS, live on :5099. On `feature/dashboard-chat-scroll`,
> pending deploy/merge. Touches the parallel session's agent-dashboard CSS —
> compose carefully.

## Problem (bug report)

In the agent dashboard's chat view (the "wall of phones," where each agent's
Chat renders inside a grid cell), the chat is **cut off / not fully rendered**:

- Scrolling all the way down doesn't work — the bottom of the conversation is
  unreachable.
- You **can't reach the message input composer** at the bottom of the cell, so
  you can't type/send from the dashboard.

## Where to look (to confirm during the fix)

Likely a layout/overflow issue in the dashboard cell, not the Chat component
itself (Chat works fine in the normal `/studio` view). Candidate causes:

- The "phones" cell in `pages/Dashboard.jsx` / `pages/dashboard.css` doesn't
  give the embedded Chat a **bounded, scrollable height** — so the chat's own
  scroll area + the sticky composer overflow the cell and get clipped.
- A missing `min-height: 0` on a flex child (the classic flexbox overflow trap),
  or a fixed/overflow-hidden cell that crops the composer.

## Goal

In a dashboard chat cell, the conversation **scrolls fully to the bottom** and
the **message composer is visible and usable** — same as the normal Chat view.

## Fix

Two CSS issues in `pages/dashboard.css`, both in the embedded-chat sizing:

1. **Root cause:** `.chat--embedded` sized itself with `height: 100%` of
   `.phone__screen`, but `.phone__screen`'s height comes from `flex: 1` — a
   flex-derived height is **not a "definite" percentage basis**, so the chat
   fell back to its content height (~848px) and overflowed the ~282px frame,
   pushing the in-flow composer past the `overflow:hidden` bottom (clipped).
2. **Fix:** size the chat by **flexbox** instead. `.phone__screen` becomes a
   flex column; `.chat.chat--embedded` fills it with `flex: 1; min-height: 0`
   (replacing `height: 100%`). The inner `.chat__scroll` gets `min-height: 0`
   so it bounds and scrolls; `.chat-input` is `flex: 0 0 auto` so the composer
   never shrinks/clips. (`.chat.chat--embedded` — two classes — also beats the
   base `.chat` height regardless of stylesheet load order.)

Verified: `verify-dashboard-chat-scroll.mjs` 6/6 + screenshot (every phone shows
a usable composer).
