# Design: pin-conversation-lanes

## D1 — Why the strip scrolled

`.arch__main` is a flex column: `.arch__head`, `.arch__lanes`, then `.arch__scroll`
(`flex: 1 1 auto; overflow: auto; min-height: 0`) and `.arch__composer`. That alone pins
the strip — as long as `.arch__main` has a bounded height. Two rules in `arch.css`
break that below 900px of page width (`@container (max-width: 900px)` on `.arch`, and a
matching `@media`): `.arch__cols { flex-direction: column; overflow: auto }` and
`.arch__main { flex: 0 0 auto; min-height: 60vh }`. They exist so the side column can
stack under the conversation and the two scroll together. But they apply whether or
not a side column is present, and the Management App's panes are narrow by nature, so
the transcript pushed `.arch__main` to its full content height and `.arch__cols`
scrolled everything.

## D2 — Fix: solo columns own their height; stacked columns get a sticky strip

1. **`.arch--solo`** — set on the root by the pages when no side column is rendered:
   always on the Tasks page; on the Arch page whenever `showSide` is false (the
   Management App's `view="chat"`, the Fleet lane, or the side hidden). One rule with
   specificity (0,2,0), placed after the queries, restores `flex: 1 1 auto; min-height: 0`
   on `.arch__main` in every layout, so `.arch__scroll` is the only scroller again.
   `.arch__cols`' `overflow: auto` is left alone: the main column now fits exactly, so
   it does not scroll, and it remains a safety valve for a pane too short for the
   composer.
2. **`.arch__top`** — a wrapper around `.arch__head` + `.arch__lanes` in both pages,
   `position: sticky; top: 0; z-index: 3; background: var(--color-bg)`. In the solo
   layouts it is inert (nothing above it scrolls). When the studio Arch tab stacks its
   side column under the conversation, `.arch__cols` scrolls as before and the strip
   sticks to the top of that scrollport. One wrapper rather than two sticky elements so
   the lane row does not need to know the (wrapping) title row's height.

No change to the composer, the banners between strip and list, the Tools / History /
Fleet lanes (they already `flex: 1 1 auto; min-height: 0; overflow: auto` under the
strip), or the dashboard/Management App hosts.

## D3 — The test renders the real thing

There was no client test tooling. `playwright` is added as a client devDependency
(browsers: Playwright's bundled Chromium if present, else the installed Chrome or Edge
channel, so no download is forced). The test starts a Vite dev server programmatically
(`configFile: false` so the `/api` proxy to :5099 never engages), intercepts requests
whose path starts with `/api/` with fixtures, opens `manage.html` with the layout, tab
and hidden-panes keys preset in `localStorage`, waits for 60 rendered turns, then in
the page: scrolls the list to its end **and** any ancestor that can scroll (this is
what exposes the bug — with the bug `.arch__cols` is the one that moves), and reports
the strip's and composer's rectangles against the pane and the viewport, a hit test at
each lane tab's centre (`elementFromPoint`), the list's own overflow (must be real),
and whether anything else scrolled. A raw `mouse.click` at the Tools tab's position
must select it — `Locator.click` would scroll a hidden tab into view first.

Cases: 1920×1080 tabs (Arch), 1920×1080 panes (Arch + Tasks), 1366×768 tabs (Tasks),
1366×768 panes (Arch + Tasks), 820×700 tabs (Arch — the media query path). Before the
fix the three narrow-pane cases failed exactly as the Operator described (`others:
arch__cols`, list overflow 0px); after it every check passes.

## D4 — Living-room / laptop fit

Nothing changes in the pane's height chain (`.mg__pane-body` → `.arch` 100% →
`.arch__cols` 100% → `.arch__main`), so the panel still fits its pane; the test's
"only the message list scrolls" check covers the page and the pane body as well, which
is the double-scrollbar regression guard.
