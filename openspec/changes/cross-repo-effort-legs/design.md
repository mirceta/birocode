# Design — cross-repo efforts with typed legs

## D1. A leg IS an assignee

`TaskGraphService.Assignee` already carries everything a leg needs — its own status,
branch, PR, merge commit, verified state, warning — and the card's status is already the
aggregate "as far as the slowest assignee". Two optional fields make it a typed leg:

| field | meaning |
|---|---|
| `Role` | `driver` (the orchestrator) \| `driven` (a product repo it drives) \| null |
| `Path` | an AGENTLESS checkout on the leg's machine; its `RepoId` is then `path:<path>` |

Nothing else changes shape: `AssigneesOf`, `WithAssignees` (the legacy mirror), per-key
`RecordClaim` / `ApplyVerification` / `MarkDispatched`, the LWW sync — all unchanged. An
older peer that does not know the fields drops them when it rewrites the node, the same
limitation manual / external have.

`Effort` (pure, unit-tested) is the vocabulary over a node: `IsAgentless`, `PathOf`,
`HasAgent`, `LegLabel` (path tail), `IsMerged` (verified ≥ pr-merged), `MergeWord`,
`Summarize` → `{Legs, Merged, CrossRepo, AllMerged, PartiallyMerged, Drivers, Driven,
Unmerged}`, `MismatchReason`, `Matches` (a leg named by path / tail / synthetic id).

## D2. The crux: done only when every leg is merged

Verification: unchanged — each leg advances forward only by ITS facts and the card
re-aggregates, so a merged driver PR leaves the card at the slowest leg. What was missing
was (a) the prg leg being on the card at all (D3) and (b) the state being named:

- `Effort.Summarize(...).PartiallyMerged` — some legs verified merged, not all — rides
  `list_tasks.effort`, the card's Legs brief ("1 of 2 legs merged — partially merged, not
  done") and a `partial-merge` filter flag.
- `Effort.MismatchReason(node)` — the column claims pr-merged / done while a leg is not
  verified merged — is a **dishonest** verdict in `BoardIntegrity.Judge` (before the generic
  per-assignee rule, so the reason names every leg and its merge state) and a `Flag` reason
  in `PolicemanSweep` at once (a fact from GitHub, not an opinion: no two-sweep wait).

Claims stay advisory (the Operator's rule: never clamp): `update_task done` still lands the
card in Done, badged, judged, flagged — never *verified* done.

## D3. Agentless legs

`AddLeg(path)` creates the leg with `RepoId = path:<path>`: no registry lookup can ever
resolve it to a managed agent, `Effort.HasAgent` is false, so dispatch skips it (or refuses
by name, status `agentless`), the policeman neither reads its transcript nor traces PRs
through an agent for it. The verifier treats the path like a registered clone when it is
on this machine: `Probe(path, branch)` for local facts, `OriginUrl(path)` to name the GitHub
repo for the PR probe, and the path joins the "is the merge live" clone map. A peer's
agentless leg can only be checked by a recorded PR URL (follow-up: the peer's poller).

## D4. The repo-agent tool server

`Services/Agents`: `RepoAgentToolbox` (pure over the graph; identity = the repoId the
harness passes), `RepoAgentMcpServer` (the same JSON-RPC skeleton as the arch / Tasks
servers), `RepoAgentToolsService` (hosted; `McpBearer`; registers
`ToolsConfigStore.HarnessServers`), `AgentToolsController` (`POST /api/agents/mcp?repo=`,
password-exempt, bearer-checked). `ToolsConfigStore.BuildMcpConfigJson` now merges the
harness entry with Birokrat's, so every path that builds a repo agent's config — the chat
controller, `CliRunnerService`'s fallback for loops, the arch's sends — carries it; Codex
turns get it through the existing url-server translation.

Tools: `my_effort(includeDelivered?)` and `report_leg(task?, leg?, branch?, commit?, pr?)`.
Authority in `report_leg`: your own leg always; another leg only if you are the card's
DRIVER and the target is not itself a driver. It records a claim (`RecordClaim`), never a
status — the verifier moves the column from the facts.

## D5. The arch

`list_tasks`: per leg `role`, `agentless`, `path`, `merged`, `mergeState` (handles for agent
legs, "copy1/prg (no agent)" for agentless); per card `effort`. Tools `add_leg` (agent by
machine/repoId, or `path` on `machine`), `remove_leg`, `set_leg_role`, `assign_task(role)`;
`update_task(assignee)` accepts a path / tail for an agentless leg. `dispatch_task` targets
only agent legs and answers `agentless` when nothing pingable remains. The brief lists every
leg ("copy1/prg (no agent): driven, no agent — checkout …, PR …, PR #166 open, not merged"),
states the done rule and names `report_leg` / `my_effort`. Role prompt v12 explains all of it.

## D6. UI

`legsOf(node, {label})` → the Legs section (shown only for efforts: several legs, or any leg
typed / agentless) with a row per leg — role glyph + word, name, "no agent", status, merge
word linked to the PR — and the brief; amber when partially merged, green when every leg
merged. `boardCheckOf` takes the same labeller so the mismatch text names handles. The detail
row "add leg" (role · agent select or checkout path · branch · PR URL) posts `…/legs`; a role
select per assignee posts `…/legs/role`; removal is the existing ×. Agentless chips and the
agent filter chips read "copy1/prg (no agent)".
