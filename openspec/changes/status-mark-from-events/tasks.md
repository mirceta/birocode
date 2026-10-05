## 1. Build

- [x] 1.1 `FleetAttention` store + rules (`IsGenuineFinish`, `Resolve`, `LatchSpeaks`, `Ingest` with backlog/baseline, `Ack`), persisted to `fleet-attention.json`.
- [x] 1.2 `CollectorService.Ingested` (per-source batch, backlog flag); `NextWatermark` resets a restarted peer feed to a backlog pull.
- [x] 1.3 `ArchAgentService`: `Unseen(...)` in the local and remote views and the fleet status (`unseenFrom`, machine `reportsMark`); `MarkAgentChecked` acknowledges the hub record and relays only where the latch speaks.
- [x] 1.4 Status tab: the chip title and detail note say when the hub raised the mark; machine badge `finish mark: from the hub`. Management bundle rebuilt.

## 2. Verify

- [x] 2.1 xunit `FleetAttentionTests` ×10 (the living-room case, stop/ask/start rules, restart backlog, feed restart cursor, authority rules, self key); node `agentsView.test.mjs` +1.
- [x] 2.2 Real binaries: `.claudeweb-preview/mark/old-peer-e2e.mjs` — lab peer built from `d2ce4d16`, lab hub on the pre-fix build → no mark in 45 s; on this build → mark raised (`unseenFrom: hub`), ✓ clears without a peer endpoint, a second turn marks again. Screenshot `docs/screenshots/status-agents-old-peer-mark.png`.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word. Peers on `d2ce4d16` get the dock's own mark once upgraded.
