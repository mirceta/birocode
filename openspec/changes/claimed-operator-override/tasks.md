## 1. Build

- [x] 1.1 `SendTask(..., overrideClaimed)` → local claimed check lifted + audited; remote send
      carries `override`; `PeerSendTask(..., overrideClaimed)` honours + audits it;
      `FleetClient.Send(override)`; peer request record `Override`.
- [x] 1.2 MCP `send_task` param `operatorAsked`; role prompt rule 6b; operator Ping on the
      kanban passes the override; contract doc §5.

## 2. Verify

- [x] 2.1 Live, this box (2026-09-05 21:06, build aa68fa5): the operator asked the arch
      explicitly to reach the claimed local `prg` agent (feature branch); the arch called
      `send_task {operatorAsked: "true"}` → `sent`, "claimed-override accepted"; the agent
      ran the turn. Without the ask the same repo stays `claimed` (unchanged rule).
- [x] 2.2 MONSTER (build 4aaf69b): the arch's push request to MONSTER's birocode was answered
      `denied` by that build's old deny-word fence before the claimed rule even applied;
      MONSTER needs a build with the fence removal + this override (its next upgrade:
      accept fleet upgrades there, then `upgrade_peer`). MONSTER's work had meanwhile been
      pushed and was merged here (aa68fa5) and deployed.
