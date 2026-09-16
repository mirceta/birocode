# Design

## Reuse, not a second scheme

The repo-agent dock's windowing (plans/chat-windowing.md) is a render-only cap: the
whole thread sits in state, the last `WINDOW` messages are rendered, "Show earlier"
reveals `REVEAL_CHUNK` more, and the reader's distance from the bottom is restored
after the reveal. The arch conversation adopts the same numbers, the same button, the
same arithmetic and the same anchor rule; the one difference is where the messages come
from, because the arch page POLLS its transcript every 3 s instead of streaming it:

| | Repo-agent dock (`Chat.jsx`) | Arch conversation (`Arch.jsx`) |
|---|---|---|
| Window / reveal | `TRANSCRIPT_WINDOW` (50 / 50) | the same constants |
| Where the thread lives | state (loaded once, streamed live) | the server; the page fetches `?tail=visibleCount` on each poll |
| Rendered | `messages.slice(start)` via `windowOf` | everything fetched (= the window) |
| Hidden count | `windowOf(messages.length, visibleCount)` | `windowOf(total, messages.length)` with the server's `total` |
| Reveal | `visibleCount += REVEAL_CHUNK`, slice grows | same, then the next load fetches the wider tail |
| Position kept | restore `scrollHeight − anchor` on `visibleCount` | restore on the next `messages` change after a reveal |
| Reset to the tail | session change, send | conversation/session change, send, reload |

Fetching only the window is what makes the page fast on a long thread — the poll is
no longer proportional to the thread — but it is the dock's window, not a new pager.

## Server

`GET /api/arch/messages?tail=N` → `{ sessionId, messages: last N, total }` through
`TranscriptWindow.Tail` (pure, tested). No `tail` = the whole thread, as before. The
transcript is still read from the cached JSONL and annotated with actors as today; only
the payload shrinks.

## Scrolling on every layout

The arch pane (`.arch__scroll`) is a flex child; in a bounded pane it scrolls itself,
on the studio route the nearest scrolling ancestor scrolls. So:

- `scrollerOf()` walks up from the pane to the first ancestor with `overflow-y: auto`
  that actually overflows, falling back to the document.
- "At the bottom" = the transcript pane's bottom edge is within 40 px of that
  scroller's viewport bottom (`transcriptGap`), not the scroller's own bottom — in the
  stacked layout the side column sits below the conversation.
- Follow = `lastElementChild.scrollIntoView({ block: 'end' })`, repeated on the next
  frame for late layout; only while stuck to the bottom and never during a reveal.
- Stick detection listens on the pane and, with capture, on the window, but only
  events from the transcript's own scroller count.

## Verification

`verify-arch-window.mjs` (detached, `@@ARCH-WINDOW@@`): an isolated instance whose arch
home is a temp dir holding a synthetic 3000-message transcript (the live arch home is
never touched; the temp session is removed afterwards). Measured: poll payload 808 KB
→ 13.6 KB (59×), 50 bubbles mounted instead of 3000, first settled render ≈ 1–2.8 s,
"Show earlier" +50 with the exact hidden count and the reading position kept, no
jump-to-bottom while scrolled up, reload back to the 50-window at the newest turn.
