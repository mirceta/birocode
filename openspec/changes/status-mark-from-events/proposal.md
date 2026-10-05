# Status → Agents: the "finished, not yet checked" mark for machines that cannot report it

## Why

Fleet task 9c1120fe (the Operator, 2026-10-06): PR #142 is live on the hub, yet the agent
**living room/living-room** went straight back to the default state after its run — no `!`.

## What happened (from the hub's own records, not fixtures)

- The mark's state is the dock's `unseenResult` latch **on the machine that ran the turn**, read
  off that machine's describe (openspec status-agents-attention, D1). The hub mapped a missing
  field to "no mark".
- The hub's arch transcript shows living room reporting build `1.0.0+d2ce4d16` (19 Sep 2026) at
  every machine listing since the fleet upgrade of 19 Sep, last on 2026-10-05 10:08Z; no
  `upgrade_peer` went to it afterwards. `d2ce4d16` is 36 commits before PR #142: its describe
  has no `unseenResult` field, its dock latches only hidden tabs, and it has no
  `agents/checked` endpoint. Between 20:41Z and 23:09Z its `lastActor` turned `none → human`:
  the Operator's run.
- Four of the six peers (spacex, razvoj2016, fotrsqlbirokrat, living room) are on that build;
  the mark was missing for every agent on them, not for living-room alone.
- Reproduced with the real binaries: a lab peer built from `d2ce4d16`, a lab hub on main, a
  real builder turn on the peer → the hub never marks it (45 s). The peer's describe shows
  `runningSince` and no latch; `POST /api/arch/peer/agents/checked` answers 404.
- A second hole of the same kind: a repo with **no dock** has no tab to latch, on any build.

## What changes

The hub raises the mark itself where the dock's latch cannot speak, from a signal every build
has sent since the event feed existed: the `turn.ended` events the collector already pulls
from every machine.

1. `FleetAttention` (new, `fleet-attention.json`): per agent, when its last genuine builder
   turn ended and through which finish the Operator acknowledged it — both in the producing
   machine's clock. Fed by a new `CollectorService.Ingested` hook per source batch; a backlog
   (the first pull after a hub start, a new source, a restarted peer feed) only counts what
   ended after the last event the hub had seen from that source, and a source met for the
   first time is a baseline.
2. The Status tab's `unseenResult` for an agent = the dock's latch where it speaks (reported and
   docked) — and then the hub's record follows it — otherwise the hub's record. A new
   `unseenFrom` (`dock` | `hub`) and a per-machine `reportsMark` let the tab say so.
3. ✓ "mark as checked" clears the hub's record always and relays to the peer only where the
   peer's latch speaks; a peer without the endpoint is no longer a 502.
4. The collector pulls a peer's feed from its start again when the feed's last seq fell below
   the cursor (the peer restarted) instead of skipping those events for good.

## Honest limits

A `turn.ended` cannot tell a turn the Operator stopped by hand from one that failed (both end
`error`), so on such a machine a stopped turn is marked too — the side to err on. The dock's own
mark (and its stop exclusion) returns when the machine runs a build with PR #142; the tab's
`finish mark: from the hub` badge says which machines are not there yet.
