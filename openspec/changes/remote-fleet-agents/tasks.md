## 0. Plan — agreed with the Operator 2026-10-10

- [x] 0.1 Understanding app: what this harness sees today, how peers join (a relay), three sizes,
      prerequisites, questions (`understanding-app/`, commits 79fbcaf6 + 94157237).
- [x] 0.2 Size M agreed; process agreed — build on the branch, the hub agent pulls and tests, PR only
      when it works (no intermediate PRs); `goal-plan.md` for the arch; `request_arch` filed
      (id 08572dadba9d406a).

## 1. Server (`feat/remote-fleet-agents`)

- [x] 1.1 `RemoteRelay` (Services/Remote): allow-list (method + regex, `IsSend`), `Match`,
      `ForwardAsync` through `CollectorService.BuildPeerRequest` (headers-only for `chat`; 502 on no
      answer), `MintPeerPinAsync`, `AddressOf`, `SendsAllowed`; pure `HopUrl` / `SelfUrl` / `HomeUrl` /
      `PlanCommand`. Registered in `RemoteModuleExtensions`.
- [x] 1.2 `RemoteController`: `GET|POST relay/{sourceId}/{**path}` (404 off-list, 404 unknown machine,
      403 sends off); `POST commands` takes `screenOn` + `screen`, plans, enqueues here or forwards to
      the peer; `navigate` added to `RemoteCommandStore.Types`.
- [x] 1.3 `CollectorService.ScrubBody` — credential blanked, no 200-char cap (the cap cut the relayed dock).
- [x] 1.4 Tests `RemoteRelayTests`: allow-list (16 cases), hop/self/home URLs, the plan (local
      untouched; screen on a peer → that queue; peer agent → navigate with the PIN hop; hub agent while
      away → navigate home; unknown machine / no credential said plainly; phone navigate = home;
      forwarded navigate enqueued as is).

## 2. Client

- [x] 2.1 `remoteDispatch.js`: `navigate` type + `navigableUrl` (http(s) only), `location.assign`.
- [x] 2.2 `remoteModel.js`: `apiPathFor`, `badgeOfFleet`, `fleetGroups`, `dockTabFor`, `followScreen`
      (+ `HOP_GRACE_MS`), `pinHop`. Node tests for each.
- [x] 2.3 `Remote.jsx`: fleet-grouped list (machine headers, "this harness", dark, 📺 on the machine
      the screen is on); target carries `sourceId`/`machine`; write / stop / peek / question through
      the relay; `screenOn` belief + hop grace; `cmd` posts `screenOn` + `screen`; views bring the
      screen home first; `?pin=&then=` auto-redeem on the pairing screen; notices for no credential,
      sends off, peer down, dark machine. `remote.css` machine groups. i18n en + tr.

## 3. Verification

- [x] 3.1 `.claudeweb-preview/fleet-remote-e2e.ps1` + `client/tests/ui/e2e-fleet-remote.mjs`: two
      isolated harnesses from one build (hub :5241, peer :5242), the hub subscribed to the peer with
      the peer's password; projector + phone in Playwright. Checks: list-completeness (peer group ==
      peer dock, hub group == hub dock), relay allow-list (dock 200, repos 404), 403 while sends off,
      stop reaches the peer, the hop (projector on the PEER, no login page, heartbeat there, phone says
      so through the relay), zoom relayed to the peer, peek through the relay, back home on a hub
      agent, a view while away comes home first and opens the hub Kanban.
- [x] 3.2 All green 2026-10-11: 31/31 checks (`.claudeweb-preview/fleet-shots/e2e-result.json`), no page errors.
      Three findings fixed on the way: `ScrubFor` capped the relayed dock at 200 B (→ `ScrubBody`); the
      stale 20-s heartbeat flipped the phone's belief after every hop (→ hop grace, D4); the peer
      re-planned a forwarded navigate as "already home" (→ a navigate with a url is enqueued as is).
      E2e note: the peer runs on `localhost`, the hub on `127.0.0.1` — cookies ignore the port.

## 4. Hand-over (goal plan steps 2–6, driven by the arch)

- [ ] 4.1 Push the branch, no PR; report `TASK COMMITTED`.
- [ ] 4.2 Hub agent: switch to the branch, build, run; list-completeness against its own fleet; the
      sofa checks with the real projector; `relay-loop` fixes back here.
- [ ] 4.3 PR with the hub's report; Operator merges; fleet upgrade to main.
