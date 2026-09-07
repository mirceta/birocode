## 1. Build

- [x] 1.1 `FleetOverview`: `capturedAt`, `Claude.usage` (available, stale, fetchedAt, session,
      weekly, scopedWeekly, error), `Host.nowUnixMs` / `nowIso`, `Admin.registrySet` /
      `elevated`; the provider maps `ClaudeUsageService` in its background build
      (`MapUsage`, pure); host/admin read the new facts.
- [x] 1.2 `GET /api/arch/overview` (`ArchAgentService.SelfOverview`): this machine's fleet
      identity + the same overview record the describe carries.
- [x] 1.3 `fleetStatusTabs.js`: `overviewGroups` with five groups, meters, tones and explicit
      unknown reasons; `STRIP_FIELDS` (the audit); `overviewSummary`; `hostClock`,
      `resetLabel`, `agoLabel`.
- [x] 1.4 `FleetOverviewPanel.jsx`: shared `OverviewRow` / `OverviewGroups` (meters, tones);
      `MachineOverviewTile.jsx` in the header strip.
- [x] 1.5 Styling: `--color-text-muted` in `global.css`; `--mg-*` tokens (light + dark) in
      `manage.css`; `fleetOverview.css` shared card/meter/unknown design; the tile's sheet.
- [x] 1.6 Tests: `FleetOverviewTests` (+3), `fleetStatusTabs.test.mjs` (+5 incl. parity).

## 2. Verify

- [x] 2.1 .NET + client suites green; isolated :5200 instance before/after: Overview label /
      value contrast measured (before 2.54 / 1.25), the Overview shows the usage meters and
      explicit unknowns, the strip shows the Machine tile with the same rows; screenshots
      `docs/screenshots/fleet-overview-{before,after}.png`, `fleet-strip-{before,after}.png`.
      DONE 2026-09-07 12:00 — .NET 420 pass (+3), client 50 pass (+5); `shot-fleet-overview.mjs`
      before: label 2.54:1, value 1.25:1, hub's own accounts "n/a", 10 rows; after: label
      6.82:1, value 14.19:1, 26 rows incl. 5-hour 24% · resets 15:50, weekly 32%, Weekly ·
      Fable 60%, usage freshness, host time 12:00 UTC+2, UAC policy set / harness elevated,
      fleet posture; unreachable peers read "unknown — machine not reachable (…)".

## 3. Ship

- [ ] 3.1 Commit on `feature/fleet-overview-honest`, push, open the PR with the before/after
      screenshots (task b3e96b269aad41aeab0b563163b0636d); merge and deploy on the
      Operator's word. Peers report the new fields once they run this build; until then
      the Overview says "unknown — this machine's build predates this field".
