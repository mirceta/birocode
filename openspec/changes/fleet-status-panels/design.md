# Design — fleet-status-panels

## Overview rides the describe; scoreboard does not

Two data classes with opposite cost profiles:

- **Overview** (identity: Claude/GitHub account, host tz, admin state) is cheap and
  already cached at the source (Claude account 1 min, GitHub 5 min; host/admin instant).
  It rides the existing peer describe → `GET /api/arch/fleet/status`, so it costs one
  extra small object per machine on a poll the UI already runs.
- **Scoreboard** (analytics fold) re-reads and re-parses the entire `activity.jsonl`
  per call with no cache, O(events), unbounded in the `all` window. Putting it in the
  poll is exactly what the Operator warned against, so it is fetched **on demand** only.

## Non-blocking overview build

The describe is produced on every hub poll. A GitHub cache miss spawns `gh.exe` and can
block for seconds, which would time a peer's describe out (8 s HTTP timeout). So
`FleetOverviewProvider.Current()` returns the last built overview instantly and refreshes
the account fields on a background task when older than 30 s (single-flight). Host + admin
are instant reads, recomputed inline even on a cold start. Cold start → account fields
null → the UI shows "n/a" until the first background build lands.

## One wire shape, old peers degrade

`FleetOverview` (+ `OverviewClaude/GitHub/Host/Admin`) is one record with
`JsonPropertyName`s. The peer serializes it in `PeerDescribe()`; the hub deserializes it
into `FleetClient.PeerInfo.Overview` — nullable, defaulted null. A peer that predates the
field sends no `overview`, the hub sees null, `overviewGroups(null, machine)` maps every
account/host field to "n/a". Version + build and machine name already ride the fleet
object; "host active" = `machine.gateOpen`; "admin active" = `overview.admin.state`.

## Scoreboard relay + reuse

`ScoreboardView` is split out of `Scoreboard.jsx` (the harness's own header Scoreboard now
delegates to it, output byte-identical) so the fleet Scoreboard tab renders the identical
look. The tab calls `GET /api/arch/fleet/scoreboard?sourceId=&window=`:
`ArchAgentService.FleetScoreboard` serves self via `AnalyticsService.Compute`, or relays a
peer via `FleetClient.Scoreboard` → the peer's new `GET /api/arch/peer/scoreboard`, and
caches the answer per (machine, window) for 3 min. The client also caches a few minutes and
offers Refresh. `PeerScoreboard` logs `ms + bytes` so the cost stays provable in the log.

## Tabs

One selection shared by every machine card (so a whole view shows at once and nothing is
crammed), remembered per browser (`manageapp.fleetTab`) and mirrored to `?fleetTab=` — the
same idiom as `ManageApp`'s `?tab=`, so a wall screen can be pinned to a tab. The pure
selection + Overview-mapping logic lives in `fleetStatusTabs.js` so it unit-tests under
`node --test` (the repo has no jsdom).
