## 1. Build

- [x] 1.1 `ArchClaims.ReasonOperatorOccupied` + pure `ApplyOccupancy`; applied in `VerdictOf`
      (local) and over peer verdicts (`RemoteAgents`, `FleetStatus`).
- [x] 1.2 `OccupancyStore` (`occupancy.json`), registered; `ArchAgentService.SetOccupancy`;
      `occupancy` on every fleet-status agent.
- [x] 1.3 `POST /api/arch/fleet/occupancy`.
- [x] 1.4 Status tab: `occupancy.js`, two sections per machine, chip styling + ✋, the
      three-way control in the details, occupancy badge, filters `free` / `occupied`, legend.
- [x] 1.5 `docs/agents.md` availability bullet names the override. Bundle rebuilt + committed.

## 2. Verify

- [x] 2.1 .NET: `OccupancyTests` (rule table + store persistence). Client: `occupancy.test.mjs`.
- [x] 2.2 Headless on an isolated instance: two agents on main → both under Free; details →
      "occupied" → the chip moves to Occupied with ✋, `availability` turns `claimed` /
      `operator-occupied` in the fleet status; restart → still occupied; "free" on a
      feature-branch agent → moves to Free, `available`; "automatic" → back to the branch rule.

## 3. Ship

- [ ] 3.1 PR on the Operator's word; the Operator merges and tries it live on the hub.
