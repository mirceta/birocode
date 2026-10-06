## 1. Build

- [x] 1.1 `RepoAgentMcpServer`: `ArchPicture` opens the preamble; `request_arch` rewritten with `probe` / `ifFits` / `ifNone` / `meanwhile`; `my_peers`, `my_requests` catalogued and dispatched; startup line.
- [x] 1.2 `AgentRequestStore.Fields` persisted on the row; `RepoAgentToolbox.RequestArch` records them; `RequestView.Row` and `ParsePulled` carry them; `ComposeRequestMessage` / `ComposeRequestGoal` render them (`AppendFields`).
- [x] 1.3 `my_requests` with `RequestStatusFor` over `ArchAgentService.ArchSentAt`; environment delegate wired lazily in `RepoAgentToolsService` (`my_peers` itself: openspec repo-agent-my-peers, landed first).
- [x] 1.4 Repo Agent Requests tab renders the fields; i18n en + tr; Management bundle rebuilt.
- [x] 1.5 `docs/agents.md`: `### Arch Agent` heading, "The arch agent, seen from a repo agent" section, the harness-tools bullet; `harness_help` answers the arch question with it.

## 2. Verify

- [x] 2.1 xunit `RepoAgentRequestsTests` +5 (the picture in preamble and tool text; fields recorded / persisted / rendered / pulled; my_requests statuses incl. answered; harness_help search); pinned catalogue lists updated (4 files); full suite green.
- [x] 2.2 UI: `shot-manage-requests.mjs` renders the four fields on a card; `shot-dock-tools-harness.mjs` lists twelve tools.
- [x] 2.3 Acceptance with a fresh model (`.claudeweb-preview/acceptance-arch-picture.py` builds the prompts from the source texts): the scenario yields a request with probe + handoff, not a machine; the probe yields checked facts with the risk, not execution.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word (every fleet harness needs the build for its own agents to get the new preamble).
