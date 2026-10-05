# Design — status-agents-attention

## D1 · One state, the dock's latch

The dashboard already answers "did this agent finish while nobody looked?" with the dock tab's
server-owned `unseenResult`. The Status tab reuses that bit instead of a second store: the fleet
status carries it per agent, the hub reads a peer's bit off its describe, and the dedicated
dismiss clears that very bit. One widening was necessary — the latch used to set only on tabs
hidden from the grid; the Status tab needs every finish, so it now sets on every tab. The dock
toolbar's own rule (`isUnseen` = hidden AND latched) is untouched, so the dashboard looks the
same; the one visible consequence is that a dock that finished while on the grid and is later
hidden shows `!` in the toolbar until checked or shown again — honest, and noted in the PR.

## D2 · Viewing and acknowledging are separate acts

Expanding a chip opens its details and nothing else. The only thing that clears the mark on
this tab is `MarkChecked` — beside the chip (so the Operator never has to expand) and again in
the details. The dashboard's older clear-on-show stays for hidden docks.

## D3 · Hub-wide, with an honest optimistic view

The dismiss posts to the hub, which clears the dock latch locally or relays it to the peer and
refreshes that peer's describe. Because the fleet status is read off cached describes, the tab
hides the mark at once for the agent it just checked and keeps hiding it until the server
agrees; a new turn (`runningSince` set) spends the acknowledgement, so the next finish marks
again. Nothing is stored in the browser about the mark itself.

## D4 · Merged keeps the split's reading

Merged mode is the split's two lists concatenated (occupied first, then free, each in its own
order) with the section header's word moved onto each chip as a marker — the Operator loses
nothing but the headers and the per-section boxes. The chip's existing left-border colour and
hatch still distinguish the two.

## D5 · Running means "needs my eyes"

`matchesFilter('running')` becomes `runningSince || unseenResult` — the same reading the
dashboard toolbar's `running` state has (running OR `!`). The chip's count follows.
