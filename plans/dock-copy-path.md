# Copyable agent repo path on the dashboard

> **Status (2026-06-15):** **Built, browser-verified & merged to main.** On
> `feature/dock-copy-path`. Each agent's repository folder path on the dashboard
> (cards + phone docks) is **copyable** via a 📋 control with a "Copied!"
> confirmation, isolated from the open-agent click. Frontend-only. Verified on an
> isolated :5210 instance (`.preview-test/dock-copy-path-check.mjs`, ALL PASS).

## Problem

To tell one agent about another agent's repo, you currently retype the folder
path. The dashboard already shows it (`.dash-cell__path` on cards,
`.phone__path` on docks) but it's plain, non-interactive text — and it sits
inside the card/dock's click-to-open `<button>`, so a naive click would open the
agent instead of copying.

## Design (frontend only)

- A small **copy control** on the path line: a 📋 icon + the path as a
  click-to-copy target. Clicking copies the **full filesystem path** and shows a
  brief "Copied!" confirmation, then reverts.
- The control is a keyboard-accessible `role="button"` span (NOT a nested
  `<button>`, which is invalid inside the card/dock button) and calls
  `stopPropagation` so it never opens/maximizes the agent.
- A shared `copyText()` helper: `navigator.clipboard.writeText` with a
  `document.execCommand('copy')` fallback for non-secure (HTTP/LAN/phone)
  contexts.
- Applied to both `Dashboard.jsx` (cards) and `PinnedAgent.jsx` (docks), via one
  small shared component so they can't drift.

## Verification

- Browser-verify (per `docs/claude-web/browser-testing.md`) on an isolated
  instance: clicking the copy control on a card and on a dock copies the exact
  path, shows "Copied!", and does not open the agent.
