# fleet-status-panels — per-machine Status panels in Fleet Status

## Why

The per-machine Status panel at the top of each harness (scoreboard, GitHub account,
Claude info, host info, host/admin active) is only visible on that harness. The
Management App's **Fleet Status** shows only the *agents* running on each machine. The
Operator wants the other panels for every machine in the fleet, without cramming one
view.

## What Changes

- **Fleet Status gains per-machine tabs**: **Agents** (today's content, default) ·
  **Overview** (Claude info, host info, host active / admin active, GitHub account,
  harness version + build) · **Scoreboard**. One selection is shared across machine
  cards, remembered per browser and mirrored to `?fleetTab=` in the URL.
- **Data path**: the peer describe / `GET /api/arch/fleet/status` gains a per-machine
  `overview` object, computed cheaply and cached by the peer (non-blocking). A peer on
  an older build sends no `overview`; the hub surfaces "n/a" per field, never an error.
  The hub's own machine uses its local values.
- **Scoreboard is on-demand** (cost-aware, see design): a single relay GET
  `GET /api/arch/fleet/scoreboard?sourceId=&window=` (self local, peers relayed and
  cached ~3 min), with a spinner and a Refresh button — never in the periodic fleet
  poll. The exact same `ScoreboardView` the harness's own header Scoreboard uses is
  reused, so the look is identical.

## Cost measurement (deliverable 3)

Measured on this machine (real `activity.jsonl`, 31.8 KB) via `AnalyticsBenchmarkTests`:
compute **< 1 ms** and payload **1.2 KB (today) / 1.8 KB (7d) / 9.6 KB (all)**. That is
under the "cheap" thresholds — BUT the analytics fold is **uncached and O(events)**, and
the `all` window grows unbounded with run history. Folding it into the ~5 s fleet poll
would re-scan each peer's whole ledger on every poll. So the Scoreboard is kept
**on-demand**, which guarantees the fleet poll is unchanged (the poll payload carries
only the cheap Overview; a test enforces that `FleetOverview` has no scoreboard field).

## Non-goals

- No change to what the harness's own Status panel shows.
- No new metrics — "host active" reuses the operator gate already in the fleet object;
  "admin active" reuses the always-admin state.
