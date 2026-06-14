# Understanding — dashboard chat is cut off (bug)

## The bug
In the agent dashboard's chat view (the "wall of phones" — each agent's Chat
rendered in a grid cell), the chat is **cut off / not fully rendered**:
- Scrolling to the bottom doesn't work.
- You **can't reach the message input composer**, so you can't type/send from
  the dashboard.

## My read (to confirm)
Probably a **cell layout/overflow** problem, not the Chat component itself (Chat
is fine in the normal `/studio` view). Likely the dashboard "phones" cell
doesn't give the embedded Chat a bounded scrollable height — so its scroll area
+ sticky composer overflow and get clipped (classic flexbox `min-height: 0`
trap, or an `overflow: hidden`/fixed-height cell).

## Status
Starter plan only — `plans/dashboard-chat-scroll.md` + dashboard entry. **Fix
TBD**: I'll reproduce in a browser, pinpoint the layout cause, fix it, and
verify (scrolled to a usable composer) with a screenshot. This is in the
parallel session's agent-dashboard area, so I'll compose carefully.

## Plan
Branch `feature/dashboard-chat-scroll` off main.
