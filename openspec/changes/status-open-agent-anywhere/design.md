# Design — status-open-agent-anywhere

## D1 · Read the handle, keep "one tab per agent"

`window.open('', name)` stays the mechanism (it is what finds a tab in any window without
reloading it). What changes is what happens with the answer: `openPlan({ handle, self, href })`
is a pure decision — blocked / self / fresh / renavigate / steer — so each branch is testable
without a browser. A same-origin tab that is not the studio is renavigated (nothing of value is
lost: it was a parked page); the studio and a cross-origin harness are steered, never reloaded
(the Operator's in-page state survives, as before).

## D2 · Steering is a message with an answer

The harness tab receives `{ type: 'birocode:open-agent', agent }` and runs the very function the
`?agent=` deep link runs (`steerToAgent`), then posts an ack to the sender. The message carries
only an agent id and the receiver does nothing but pick a dock tab, so any origin may send it —
which is what lets the hub steer a peer's harness tab too. A peer on an older build simply does
not answer, and the notice says so.

## D3 · The dashboard never navigates itself away

When the dashboard is the handle, it renames itself (`birocode-dashboard`) and opens the agent
under the released name. The alternative — navigating the dashboard to the agent — would lose the
Operator's place on the board.

## D4 · The notice is the opener's event, not a guess

`focusAgentTab` dispatches `birocode:agent-open` with the outcome; for a steered tab it waits
up to 900 ms for the ack and also reports whether this page lost the foreground (so "it is in
another window" can be said honestly). The Status tab renders the latest event; a sticky line
carries a real anchor (`target=_blank`) — a direct click that no pop-up blocker intercepts.
