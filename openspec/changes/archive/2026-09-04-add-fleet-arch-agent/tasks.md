# Tasks — add-fleet-arch-agent

## 1. Collector: send permission + peer requests

- [x] 1.1 `CollectorService`: persisted per-source `AllowSends` (default false), `SetAllowSends`, `SourceView.AllowSends`, `ResolveSource(machine)` by id or label, `BuildPeerRequest(sourceId, method, path)` attaching the stored credential; the collector's own polling unchanged
- [x] 1.2 `CollectorController`: `POST /api/collector/sources/{id}/sends { allow }`; events app shows a sends on/off control per remote source

## 2. Receiving side: the peer API

- [x] 2.1 `ArchStateStore`: `ManagedFleet` keys and `AcceptFleetSends`
- [x] 2.2 `ArchAgentService`: `PeerDescribe()` (protocol, version, machine, acceptsSends, gateOpen, all registered repos as agent views), `PeerSendTask(from, repoId, text, branch)` (accept flag → gate → deny → claimed → busy → bubble `arch@<from>` → audit kind arch / phase `fleet:<from>`), `PeerReadTranscript(repoId, tail)`
- [x] 2.3 `ArchPeerController`: `GET /api/arch/peer`, `POST /api/arch/peer/send`, `GET /api/arch/peer/transcript` behind the password middleware
- [x] 2.4 `MessageActors.ActorOf`: fleet phase → `arch@<from>`; `MessageBubble` derives its class from the actor's base (`arch`)

## 3. Calling side: fleet client + tools

- [x] 3.1 `FleetClient`: per-source cached describe (5 s), `Send`, `ReadTranscript`, status vocabulary (ok | unreachable | unauthorized | no-peer-api | error)
- [x] 3.2 `ArchAgentService`: managed fleet scope, `ListAgents()` merges peer views (machine = label, `unreachable` when the peer is dark), machine resolution (`self` / self label / source label / source id), `send_task` / `read_transcript` / `git_state` route remote machines through the client with A-side checks (armed, managed, allowSends, deny) and A-side audit
- [x] 3.3 Wake composition across sources: keys `repoId` (self) and `sourceId/repoId` (remote); the self-only filter removed; prompt lines name the machine
- [x] 3.4 MCP catalogue + role prompt (v2) describe machines; `ArchController` state gains `fleet` (self label, acceptSends, sources with peer status + agents), `managedFleet`; scope accepts `fleet` keys; `POST /api/arch/fleet { acceptSends }`; preflight rows per source

## 4. Arch tab

- [x] 4.1 Scope picker grouped by machine (local + each source that allows sends, with peer status); agent rows carry a machine chip; Fleet card with both opt-ins and per-source status
- [x] 4.2 `check-arch-tab.mjs` gains a routed fleet state check (machine chip + Fleet card)

## 5. Tests + docs

- [x] 5.1 Unit tests: remote managed events wake and name the machine; unmanaged remote events do not; machine resolution table; fleet actor annotation; fleet key parsing
- [x] 5.2 `tests/loop-eval/fleet.mjs`: two isolated instances on one box; B subscribed in A with sends allowed; B accepts; A's arch drives B's repo to green; asserts B's audit/transcript provenance (`arch@<A>`), A's collector saw B's `turn.ended`, `arch.wake` followed, A's audit carries the fleet send; `--describe` manifest; run isolated until green
- [x] 5.3 `docs/event-feed-contract.md` gains "The fleet peer API"; `understanding-app/` updated to as-built; `openspec validate add-fleet-arch-agent --strict` passes

## 6. Peer scope is authoritative + send posture (D8, after the first real two-machine run)

- [x] 6.1 Peer describe: `managed` per repo + `managedRepoIds`; unmanaged repos reported `unmanaged`; `PeerSendTask` / `PeerReadTranscript` refuse repos outside this harness's own arch scope with `unmanaged` naming its Arch tab
- [x] 6.2 `FleetClient.PeerRepo.Managed` (nullable: older peers); `ArchAgentService.FleetSendPosture` (pure) + `RemotePosture`; `send_task` refuses locally before any HTTP; `AgentView` carries `Blocked` / `ManagedThere` / `Sendable`
- [x] 6.3 Tools: `list_agents` gains `managedThere`, `sendable`, `blocked`; new `list_machines`; MCP descriptions say never guess a repoId; role prompt v3 (fleet section rewritten)
- [x] 6.4 Arch tab: picker names a peer repo outside the peer's own scope and disables it; Fleet card shows "its arch manages N of M"; remote agent rows show the block reason; `/api/arch` agents carry `sendable` / `blocked` / `managedThere`, fleet sources carry `managed` per repo + `managedThere`
- [x] 6.5 Tests: posture table (unit); `check-arch-tab.mjs` asserts the disabled unscoped row + the Fleet card count; `fleet.mjs` asserts B's describe before/after B scopes, the `unmanaged` refusal, and A's sendable view; docs contract updated; understanding app updated
