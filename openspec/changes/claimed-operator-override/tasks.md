## 1. Build

- [x] 1.1 `SendTask(..., overrideClaimed)` → local claimed check lifted + audited; remote send
      carries `override`; `PeerSendTask(..., overrideClaimed)` honours + audits it;
      `FleetClient.Send(override)`; peer request record `Override`.
- [x] 1.2 MCP `send_task` param `operatorAsked`; role prompt rule 6b; operator Ping on the
      kanban passes the override; contract doc §5.

## 2. Verify

- [ ] 2.1 Live, this box: the arch, asked explicitly by the operator, sends to a local
      claimed repo with `operatorAsked` → `sent`, audit `claimed-override`; without the ask
      it stays `claimed`.
- [ ] 2.2 MONSTER: the same send is answered `claimed` until MONSTER runs a build with the
      field (its next upgrade).
