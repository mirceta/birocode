## 1. Backend

- [x] 1.1 `ArchAgentService.FleetStatus()` + `OnDefault`; describe reads git for
      docked repos and reports `docked`; `PeerRepo.Docked`; `GET /api/arch/fleet/status`.

## 2. Management App

- [x] 2.1 `FleetStatus.jsx` (poll 5 s, filters, chips, detail, legend), Status tab in
      `ManageApp.jsx` (+ side-by-side pane), styles, i18n (en + tr).
- [x] 2.2 Events app: Agents tab removed.

## 3. Verify

- [x] 3.1 Endpoint on live: self + MONSTER machines, agents with branch/onDefault/running;
      answers fast (cached describes).
- [x] 3.2 Browser check on live through the Management App: Status tab renders machines
      and chips, filters count and narrow, a chip opens its detail, side-by-side shows
      four panes; events page has no Agents tab; no page errors.
- [x] 3.3 Deploy the harness build (self-upgrade) so the endpoint and the describe change
      are live here; MONSTER gets them with its next upgrade.
      DONE 2026-09-05 20:02 (self-upgrade to fe3b159, kept): `GET /api/arch/fleet/status`
      answers in ~20 ms with this box (16 agents: docks + arch scope, branch/onDefault/
      running/managed/docked) and MONSTER (18 agents from its cached describe; its old
      build reports no `docked`, so every repo whose branch it read is listed). Browser
      check `.claudeweb-preview/playwright/check-fleet-status.mjs` on live 13/13: Status is
      the 4th tab, machines + chips render, "on main" and "running" filters narrow to the
      counted agents, a chip opens its detail, side by side shows four panes, the events
      page tabs are Activity · GitHub · Sounds · Manage. MONSTER's chips gain `docked` once
      it runs this build.

## 4. Arch cards on the Status tab

- [x] 4.1 `Arch` gains `view` (full | chat | cards); the Management App renders the Arch
      tab with `view="chat"` (no side column, no Fleet lane) and the Status tab with the
      fleet strips followed by `Arch view="cards"`; styles + i18n.
- [x] 4.2 Browser check `check-manage-arch-split.mjs` on live: manage Arch has three lanes
      and no side column; Status shows the strips first and then Loop / Managed agents /
      Fleet / Home repo with the arm control; the studio Arch tab is unchanged.
