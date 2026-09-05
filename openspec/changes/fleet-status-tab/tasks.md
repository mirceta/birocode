## 1. Backend

- [x] 1.1 `ArchAgentService.FleetStatus()` + `OnDefault`; describe reads git for
      docked repos and reports `docked`; `PeerRepo.Docked`; `GET /api/arch/fleet/status`.

## 2. Management App

- [x] 2.1 `FleetStatus.jsx` (poll 5 s, filters, chips, detail, legend), Status tab in
      `ManageApp.jsx` (+ side-by-side pane), styles, i18n (en + tr).
- [x] 2.2 Events app: Agents tab removed.

## 3. Verify

- [ ] 3.1 Endpoint on live: self + MONSTER machines, agents with branch/onDefault/running;
      answers fast (cached describes).
- [ ] 3.2 Browser check on live through the Management App: Status tab renders machines
      and chips, filters count and narrow, a chip opens its detail, side-by-side shows
      four panes; events page has no Agents tab; no page errors.
- [ ] 3.3 Deploy the harness build (self-upgrade) so the endpoint and the describe change
      are live here; MONSTER gets them with its next upgrade.
