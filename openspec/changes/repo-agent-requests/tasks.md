## 1. Build

- [x] 1.1 `AgentRequestStore` (Services/Agents): persisted rows, `Record` with limits and duplicate answer, `Decide` final, `MarkDelivered`, `MergePulled`, `ApplyPushedDecision`, trim; registered in `AddAgentsModule`.
- [x] 1.2 `request_arch` on the `claude-web` server: `RepoAgentToolbox.RequestArch` (records + audits, never touches the arch), dispatch, catalogue, instructions; environment field `Requests`; startup line.
- [x] 1.3 `ArchAgentService.Requests`: `SyncAgentRequests` (pull managed peers' rows, push decisions), `ApproveAgentRequest` / `DismissAgentRequest`, `DeliverAgentRequests` on the engine tick, `ComposeRequestMessage`, actor `request`; peer handlers; `FleetClient.AgentRequests` / `AgentRequestDecision`; `ArchPeerController` `GET requests`, `POST requests/decision`.
- [x] 1.4 `ArchController`: `GET /api/arch/requests`, `POST /api/arch/requests/{id}/approve` (gated), `POST /api/arch/requests/{id}/dismiss`.
- [x] 1.5 Management tab `requests` (`AgentRequests.jsx`): pending cards with Approve / Dismiss (confirm), decided folded, peers, how-to; i18n en + tr; bundle rebuilt.
- [x] 1.6 `docs/agents.md` names the tool.

## 2. Verify

- [x] 2.1 xunit `RepoAgentRequestsTests` ×9: record / persist / decide-final / deliver, limits, hub merge rules, peer-side pushed decision, trim, the tool records only, the catalogue names ten tools and dispatches, the message, the peer-reply parser; pinned catalogue lists updated (3 files).
- [x] 2.2 UI: `shot-manage-requests.mjs` 10/10 (tab listed, pending cards, decided folded then open, peers with status, how-to, Approve posts + turns approved, Dismiss confirms then posts); `shot-dock-tools-harness.mjs` lists the tenth tool.
- [x] 2.3 Isolated-instance e2e (`.claudeweb-preview/requests-e2e.ps1`, 11/11): the seeded store read at boot, dismiss persisted on disk, decisions final, peer routes list local rows only and apply a pushed decision (refusing a pulled row), approve starts the arch turn with the user message tagged actor `request`, the row shows `deliveredAt`.
- [ ] 2.4 Not covered: a two-machine pull / push over a real fleet (both builds needed).

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word (both hub and peers need the build for cross-machine requests; a peer on an older build answers `no-peer-api` and is named on the tab).
