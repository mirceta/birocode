# Arch / management conversation: window it like a repo-agent dock

## Why

The Operator-facing "Arch agent" conversation (and every goal conversation) rendered its
ENTIRE thread on every load and every 3-second poll: the page fetched the whole
transcript and mounted a markdown bubble per message. The live thread is past 5000
transcript lines (10 MB on disk), so the management UI had become slow and janky.
Repo-agent conversations do not do this: the dock renders only the most recent window
of 50 messages and reveals older ones on demand ("Show earlier messages"). The Operator
asked (2026-09-16, task f1c917f5) to adopt exactly that behaviour for the arch surfaces.

## What changes

- **One transcript window, shared.** `client/src/components/chat/transcriptWindow.js`
  holds the numbers (window 50, reveal 50) and the arithmetic both surfaces use. The
  repo-agent chat (`Chat.jsx`) now reads its `WINDOW` / `REVEAL_CHUNK` from it — no
  behaviour change there — and the arch conversation (`Arch.jsx`) uses the same module,
  so the two can never drift apart.
- **The arch conversation loads the recent window.** `Arch.jsx` keeps a `visibleCount`
  like the dock, fetches only that tail (`GET /api/arch/messages?tail=N`), renders it,
  and shows the dock's "Show earlier messages (N)" button above it; each click widens
  the window by 50, re-pulls, and keeps the reader's position. A send, a reload or a
  switch to another conversation snaps the window back to the tail. Goal conversations
  are the same component with a `conv`, so they get it for free.
- **The poll stays small however long the thread is.** `GET /api/arch/messages` gains an
  optional `tail` and returns `total`, so the 3-second poll carries the window (13 KB
  on a 3000-message thread) instead of the whole thread (808 KB), and the hidden count
  is exact. Without `tail` the endpoint is unchanged.
- **Follow-the-tail is scroller-aware.** The arch pane's actual scrolling element
  differs by layout (the pane itself in the Management App, an ancestor on the studio
  route); following new content, keeping the reading position on a reveal, and "am I at
  the bottom" now read the real scroller and the transcript's own bottom edge, so a
  wake-up appends at the bottom in real time and never yanks a reader who scrolled up.

## Non-goals

No change to how messages are sent, how the live turn streams and hands over, the
arch tools, or the repo-agent chat's behaviour. No second pagination scheme: this is the
dock's window applied to the arch surfaces, with the fetch bounded to it.
