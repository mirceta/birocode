# Proposal: pin-conversation-lanes — the Chat / Tools / History strip stays put

## Why

In the Management section's agent conversations (the Arch tab and the Tasks tab) the
top of the conversation panel — the title row and the Chat / Tools / History lane strip
— scrolled away with the transcript. Once a long conversation was scrolled down, the
lanes could not be seen or reached without scrolling all the way back up. The Operator
considers that strip an important part of the UI (fleet board task
`20ba36e560e54f3f8515e40828f032ce`, 2026-09-06).

Root cause: `arch.css` stacks the layout when the page is narrower than 900px
(container and media queries) and, to let a side column sit below the conversation,
sizes `.arch__main` to its content and makes `.arch__cols` the scroller. The
Management App's panes are almost always narrower than 900px (side by side on a laptop,
or the window itself), so the whole conversation — strip included — scrolled as one
block. The Tasks page and the Management App's Arch pane never have a side column, so
that trade-off bought them nothing.

## What

- **The strip is pinned.** In every management-agent conversation view (studio Arch
  tab, studio Tasks tab, the Management App's Arch and Tasks panes, the dashboard's
  Arch pop-up) the title row and the lane strip stay at the top of the conversation
  column however far the transcript is scrolled; only the message list scrolls beneath
  them and the composer stays at the bottom.
- **Two mechanisms, one CSS file.** A conversation column with no side column
  (`.arch--solo`) keeps owning its height in the stacked layouts so `.arch__scroll` is
  the only scroller; where the side column really stacks below the conversation (the
  studio Arch tab on a narrow pane) the strip is `position: sticky` at the top of the
  scrolling column instead.
- **A rendering test guards it.** `client/tests/ui/pinned-conversation-lanes.mjs`
  (`npm --prefix client run test:ui`) renders the real Management App through a Vite
  dev server against mocked API data — a 60-message transcript — in a headless browser,
  at big-screen and laptop sizes, in the tabs and side-by-side layouts, and asserts the
  strip and the composer stay inside the pane and hittable after scrolling to the end,
  that nothing but the message list scrolls, and that a raw click on Tools switches
  lanes from the scrolled state.

## Out of scope

The repo-agent dock (`Chat.jsx`): it already pins its bar by construction (`.chat__bar`
above a flex-grown `.chat__scroll`), which is the approach reused here. Changing the
side column's stacking behaviour on narrow panes.
