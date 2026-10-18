## 1. Build

- [x] 1.1 `ArmStatus` / `SetArmed` + `GET/POST /api/arch/armed`; `WhyEnded` words; the refusal says why and where.
- [x] 1.2 `ArchArmBar` on every arch conversation and in the Management arch cards; rules table; remove-conversation warning.

## 2. Verify

- [x] 2.1 armModel tests (5), ArchArmControlTests (2); client 299+, arch .NET suites green.
- [x] 2.2 Lab (one isolated harness from this branch, copy of the live store incl. loops.json, no fleet sources): 16/16 — today's real state shows OFF with the last goal AND "standing wake loop: stopped because its conversation was deleted"; Turn on → ON by the standing loop on "Standing loop"; Turn off → OFF "stopped by the Operator"; the bar on the studio's default conversation too.
- [ ] 2.3 Live: deploy, then the Operator turns the arch on from the bar.

## 3. Ship

- [ ] 3.1 PR / merge / deploy on the Operator's word.
