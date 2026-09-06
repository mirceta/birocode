# Tasks — fleet-status-panels

## 1. Backend — Overview in the fleet poll

- [x] 1.1 `FleetOverview` wire records + `FleetOverviewProvider` (non-blocking cached
      build; host/admin instant, account fields background-refreshed). DI registered.
- [x] 1.2 `PeerDescribe()` and `FleetStatus()` (self + peers) carry `overview`;
      `FleetClient.PeerInfo.Overview` nullable/defaulted → old peers degrade to null.

## 2. Backend — Scoreboard on demand

- [x] 2.1 `PeerScoreboard(window)` (peer producer, logs ms+bytes) +
      `GET /api/arch/peer/scoreboard`.
- [x] 2.2 `FleetScoreboard(sourceId, window)` hub relay (self local / peer relayed,
      cached ~3 min) + `GET /api/arch/fleet/scoreboard` + `FleetClient.Scoreboard`.

## 3. Frontend

- [x] 3.1 `ScoreboardView` split out of `Scoreboard.jsx` (own output unchanged).
- [x] 3.2 Fleet Status per-machine tabs (Agents default · Overview · Scoreboard),
      shared selection persisted per browser + `?fleetTab=` URL param.
- [x] 3.3 `FleetOverviewPanel` (n/a for missing) and on-demand `FleetScoreboardTab`
      (spinner + Refresh + client cache) reusing `ScoreboardView`.

## 4. Measurement (deliverable 3)

- [x] 4.1 `AnalyticsBenchmarkTests` prints bytes + ms per window on the real ledger;
      `PeerScoreboard` logs ms+bytes in production. Decision: on-demand (see design).

## 5. Tests + verify

- [x] 5.1 Backend: describe carries overview; old peer degrades to null; partial
      overview; poll payload never carries a scoreboard field (327 pass).
- [x] 5.2 Frontend: tab selection (URL/saved/default) + Overview mapping for a modern
      and an old/different-build machine, incl. n/a degrade (15 pass).
- [x] 5.3 `dotnet build` + full suite green; client build + `node --test` green.
