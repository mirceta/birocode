# Pin my last prompt at the top of the chat

> **Status (2026-06-15):** **Built, browser-verified & merged to main.** On
> `feature/pin-last-prompt`. Keeps the user's most recent sent prompt pinned and
> always visible at the top of the chat (main chat tab + dashboard docks), so a
> long agent response doesn't bury "what did I ask?". Verified on an isolated
> :5210 instance (`.preview-test/pin-last-prompt-check.mjs`, ALL PASS).

## Problem

When the agent emits a lot of text, the user's own last prompt scrolls far up and
out of view; to recall what they asked they must scroll back. There's no
always-visible reminder of the latest prompt.

## Design (frontend only)

- In `Chat.jsx`, compute the **last `user` message** in `messages`.
- Render a **pinned banner** (`.chat__pinned`) between the chat toolbar and the
  `.chat__scroll` transcript — a non-scrolling flex child, so it's always
  visible. Shows a "Your last prompt" label + the text.
- **Clamp to ~3 lines** collapsed; click to **expand/collapse** the full prompt
  (long prompts shouldn't dominate the view). State is local.
- The message still renders normally in the transcript; the banner is a copy.
- Scope: **both** the main chat tab and the dashboard docks (embedded); the
  banner clamps tighter when embedded.

## Verification

- Browser-verify (per `docs/claude-web/browser-testing.md`) on an isolated
  instance: send a prompt → pinned at top; scroll transcript → stays visible;
  send another → updates; long prompt clamps + expands on click.
