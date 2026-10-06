## 1. Build

- [x] 1.1 `ArchAgentService.PeerFleet()` (this machine + every peer's cached describe; dark and older peers marked); `PeerMachine` / `PeerRepoRow` / `PeerAgent` records.
- [x] 1.2 `RepoAgentToolbox.MyPeers` (same-repo marking by remote URL / handle base / name, handoff targets, filters `repo` and `sameRepoOnly`, the routing detail); environment delegate wired lazily in `RepoAgentToolsService`.
- [x] 1.3 `my_peers` catalogued and dispatched; the one line in the `request_arch` description and the preamble; `docs/agents.md` bullet; startup line.

## 2. Verify

- [x] 2.1 xunit `RepoAgentRequestsTests` +4 (every machine and agent with same-repo marks, dark and older peers, filters and the NONE case, the same-repo rules, the one line in tool text and preamble); pinned catalogue lists (11 tools) in 4 files; full suite green.
- [x] 2.2 UI: `shot-dock-tools-harness.mjs` lists eleven tools.
- [x] 2.3 Acceptance with a fresh model: the LOCAL spike handoff replayed with a `my_peers` result → a request addressed to prg on MACHINE-B; with no other prg agent → a request to the Operator to register prg on a named machine.

## 3. Ship

- [ ] 3.1 PR (first of two for d528046d); merge + deploy on the Operator's word.
