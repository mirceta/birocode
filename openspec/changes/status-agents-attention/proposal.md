# Status → Agents: a split / merged switch, and "finished, not yet checked" until dismissed

## Why

Fleet task 4a1fb7ee (the Operator, 2026-10-05): *"I run many repo agents across the fleet and
I am often away from the keyboard. When I come back I need to see at a glance which agents
finished while I was gone, and I need the list compact enough to scan."* Today every machine
renders two sections (Occupied above Free) — too much vertical space per machine — and the
Running filter drops an agent the moment its turn ends, so a finish is easy to miss.

## What the code says (verified)

- The Agents subtab (`FleetStatus.jsx`) reads one hub endpoint (`GET /api/arch/fleet/status`),
  splits each machine's agents with `splitByOccupancy`, filters with `matchesFilter`
  (`running` = `runningSince` set), persists its filters per browser, and already carries
  manual occupancy, the text filter and "open harness".
- The harness's own dashboard already marks a finished agent: the dock tab's **server-owned
  `unseenResult` latch** (openspec dock-busy-indicator, unseen-result amendment) — set by
  `DockUnseenResultTrigger` when a builder run reaches done/error, rendered by `DockToolbar`
  as a near-black exclamation dot, persisted in `dock.json`. It latched only tabs HIDDEN from
  the grid and cleared when the dock was shown. Nothing relayed it to the fleet.

## What changes

1. **Split / merged switch** beside the filters (Agents subtab only): `split` = the two sections
   as today; `merged` = ONE list per machine, occupied first then free, each chip carrying an
   `occupied` / `free` marker on its row, no section headers. Remembered per browser
   (`manageapp.fleetAgentsLayout`). Every filter and the text filter work in both modes.
2. **"Finished, not yet checked"** reuses the dock's `unseenResult` latch as THE state and the
   dashboard's `!` as THE visual language:
   - the latch now sets on **every** tab of the repo at a builder-run finish (not only hidden
     ones) and rides on every fleet agent (`unseenResult` on the hub's status, on the peer's
     describe, in `FleetClient.PeerRepo`), so the Status tab marks a finished agent wherever
     its dock is and whichever machine it is on;
   - the Running filter keeps an agent that finished until it is checked; the `!` shows in the
     running view, in split and merged mode, in the chip and in its details;
   - a **dedicated** ✓ "mark as checked" (beside the chip and in the details) posts
     `POST /api/arch/fleet/checked { sourceId, repoId }`, which clears the latch here or relays
     it to the peer (`POST /api/arch/peer/agents/checked`, behind its accept-sends opt-in).
     Expanding the agent never clears it. After the dismiss the agent is a normal idle agent
     and leaves the running view.
   - **Persistence: shared hub-wide**, not per browser — the state is the dock tab's latch in
     that machine's `dock.json`, so a reload, another browser and the dashboard all agree; a
     peer on an older build reports no field and shows no mark (honest), and a peer that does
     not accept fleet sends refuses the dismiss with that reason.

## Out of scope

- Changing the dashboard dock toolbar's rendering (it still shows `!` only on hidden tabs, by its
  own rule); showing a hidden dock still clears the latch as before.
- A per-run history of finishes (the latch is one bit per tab).
