## 1. Build

- [x] 1.1 `LoopConfigStore`: `ArmedBy` on the record and every start; `Stop(repoId, by)`;
      loop transitions published on the harness feed (`loop.armed | fired | escalated |
      capped | done | error | stopped`); `armedBy` in the ungated loop projection.
- [x] 1.2 `ArchLoopTools` (pure): the panel's parameter set, validation, kind inference,
      audit summary, list view, wake lines.
- [x] 1.3 `ArchAgentService`: `list_loops` / `start_loop` / `update_loop` / `stop_loop` with
      send_task's gates (`LoopGate`), local start/update/stop on the store, peer relay,
      `PeerLoops` / `PeerLoop`; loop events in `ComposeWakeCore`; role prompt v5 with the
      "Loops on repo agents" section.
- [x] 1.4 Peer API `GET /api/arch/peer/loops`, `POST /api/arch/peer/loop`; `FleetClient.Loops`
      / `Loop`; MCP catalogue + descriptions.
- [x] 1.5 Dock Loop panel shows "by arch" (summary + armed row), i18n en + tr; harness client
      and Management App bundle rebuilt.

## 2. Verify

- [x] 2.1 `ArchLoopToolsTests`: schema/refusals/cap/inference, update rule, audit summary,
      `ArmedBy` round trip, `Stop(by)`, feed events + `EventTypeFor`, list view, wake
      composition, MCP catalogue (19 tools), role prompt. `ArchAgentTests` amended.
- [x] 2.2 Full `dotnet test` green; `npm run build` and `build:manage` green (2026-09-06).
- [ ] 2.3 Live: "arch, set a goal loop on <agent>: goal …, cap 3" → `start_loop` armed, the
      dock shows the loop "by arch", the engine fires it, `loop.fired` wakes the arch, the
      Operator stops it from the dock; `stop_loop` on a remote agent on an older peer
      answers `no-peer-api`.

## 3. Ship

- [ ] 3.1 Merge to main (PR), deploy with `swap.ps1` and keep on the operator's instruction;
      the arch home's `CLAUDE.md` is rewritten to v5 on the next arm.
