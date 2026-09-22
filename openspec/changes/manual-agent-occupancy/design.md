# Design

## D1 — One rule, applied where the verdict is made

`ArchClaims.ApplyOccupancy(verdict, operatorOccupied?)` is the whole composition, pure and
tested:

| verdict before | Operator says | verdict after |
|---|---|---|
| `available` / `claimed` (any reason) | occupied | `claimed`, reason `operator-occupied` |
| `claimed` (human-active / unassigned-branch) | free | `available`, reason `unassigned-branch` (the arch names the branch in a send) |
| `claimed` (pinned) or `available` | free | `available`, no reason |
| `busy`, `unmanaged`, `unreachable` | anything | unchanged — a running turn, scope and reachability are facts, not opinions |
| anything | nothing set | unchanged — the branch rule |

It runs inside `ArchAgentService.VerdictOf` for this machine's repos (so `list_agents`,
`send_task`'s claimed check, `read_transcript`, the peer describe and the Status tab all
agree) and over a peer's reported verdict in `RemoteAgents` / `FleetStatus` for the hub's
view of that peer.

## D2 — The store

`OccupancyStore` → `occupancy.json`: `{ "<sourceId>|<repoId>": { occupied, setAt, setBy, note } }`,
empty sourceId (or `self`) = this machine. `Set(sourceId, repoId, occupied|null)`; null
removes the entry. Atomic writes; an unreadable file starts empty and is not overwritten
until the next change.

## D3 — What the fleet status carries

Every agent object gains `occupancy: { occupied, source: "operator" | "branch", setAt, note }`.
`occupied` under `source: "branch"` is `!onDefault` — the old heuristic, now named. The
`availability` / `claimedReason` fields already reflect D1.

## D4 — API

`POST /api/arch/fleet/occupancy { sourceId?, repoId, occupied: true | false | null }` →
the fleet status (the tab re-renders from the answer). Not fenced by the autopilot gate: it
records the Operator's judgement and only ever narrows what the arch may do.

## D5 — The tab

- `occupancy.js` (pure): reading, the split, the filters (`free` / `occupied` replace
  `main` / `feature`; the persisted legacy choice is mapped), the detail badge.
- Each machine: two blocks, `Occupied · n` then `Free · n`, each a chip strip; an empty block
  reads "none". Chips: amber left edge when occupied, green when free; ✋ before the name when
  the Operator set it; `data-occupied`, `data-occupancy-source` for tests.
- Expanded details: `OccupancyControl` — three buttons, the one in effect pressed, a line
  saying who decided; posts D4 and reloads. The badge row gains the occupancy badge.
- Legend rewritten for the two states and the ✋.

## D6 — Peers

A hub's setting about `spacex/prg` lives on the hub and colours the hub's view (its tab, its
arch's `list_agents`, its sends over the fleet — refused locally as `claimed` before any HTTP).
spacex's own harness does not learn it. A setting made on spacex about its own agent rides
spacex's describe (`availability` / `claimedReason`) to every hub that reads it, but that
hub's *tab* shows `source: "branch"` for it — it cannot tell a peer's Operator setting from a
peer's branch rule (the describe carries no occupancy object yet). Follow-up: add `occupancy`
to the describe.
