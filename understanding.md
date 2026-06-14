# Understanding — Dock chat refresh

## What you asked for

On the **agent dashboard** (the wall of agent docks / "phones"), each dock
embeds that agent's live conversation. You want each dock to be able to
**refresh its conversation section — the chat itself** — so a stale dock can be
forced to re-pull the latest messages without maximizing it or reloading the
page.

## What I'll do

- Add a **refresh `↻` button** to each dashboard agent dock that re-pulls that
  one agent's conversation, mirroring the dock's existing **git-refresh** button.
- Wire it to a **single-conversation reconcile/reattach** (re-fetch the latest
  events from the backend run buffer for that key), reusing the existing
  `reconcile()` / `?after=N` plumbing — no new backend endpoint expected.
- Spinning/disabled state while in flight; an i18n string for the label.
- Browser-verify on an isolated preview instance before claiming it works.

## Assumptions

- "Conversation section" = the embedded `<Chat>` inside each dashboard dock
  (`PinnedAgent.jsx`), not the full-page `/studio` chat.
- "Refresh" means re-pull the latest transcript for that agent (and re-detect a
  running run), **not** start a new conversation or clear history.
- Per-dock (one button per agent), matching the existing per-dock git refresh —
  not one global "refresh all docks" button.

Tell me if any assumption is off — especially whether refresh should also
re-attach a running agent (badge fix) or only re-fetch messages.
