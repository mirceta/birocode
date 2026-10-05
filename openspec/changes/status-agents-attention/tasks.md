## 1. Build

- [x] 1.1 `DockRegistry.MarkUnseenForRepo` latches every tab (not only hidden); `ClearUnseenForRepo`; `AgentView.UnseenResult` from the dock; the fleet status, the peer describe and `FleetClient.PeerRepo` carry `unseenResult`.
- [x] 1.2 `POST /api/arch/fleet/checked` → `ArchAgentService.MarkAgentChecked` (self: clear; peer: `FleetClient.AgentChecked` → `POST /api/arch/peer/agents/checked` behind accept-sends, then refresh the describe).
- [x] 1.3 `agentsView.js` (layout memory, finished-unchecked reading, merged order, acknowledgement helpers); `occupancy.matchesFilter('running')` keeps the finished-unchecked.
- [x] 1.4 `FleetStatus.jsx`: the split / merged switch, merged rendering with per-row markers, the `!` chip and detail row, the dedicated ✓ beside the chip and in the details, the legend; styles.
- [x] 1.5 Management bundle rebuilt.

## 2. Verify

- [x] 2.1 node `agentsView.test.mjs` ×5 (+ the running filter in `occupancy.test.mjs` unchanged); xunit `DockRegistryUnseenTests` (latches visible tabs too, clear, nothing-to-clear).
- [x] 2.2 UI `shot-status-agents-attention.mjs` 11/11: split vs merged vs reload, the text filter in merged, running → finished keeps the agent with `!`, expanding does not clear, ✓ posts and the agent leaves the running view and is normal again, a peer's finish is marked too.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word (a peer needs the build to report and to accept the dismiss).
