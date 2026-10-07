# Design — provisioning a repo agent

## Shape

```
Operator ──"new repo agent X on M for URL"──▶ hub arch ──provision_repo_agent──▶ ArchAgentService.ProvisionRepoAgent
                                                                                   │ self?  ──▶ RepoProvisionService.Provision  (local scope)
                                                                                   │ peer:  armed · sends allowed · FRESH describe · posture
                                                                                   ▼
                                                                FleetClient.Provision ──POST /api/arch/peer/provision──▶ peer ArchAgentService.PeerProvision
                                                                                   ▲                                       │ AcceptFleetProvisioning · gate
                                                                                   │                                       ▼
                                                                hub scope += sourceId/repoId · refresh describe · AgentRow     RepoProvisionService.Provision
```

## Decisions

- **One service per harness, called three ways.** `RepoProvisionService.Provision(requestedBy,
  url, name, parentFolder, defaultBranch)` is the only code that clones / registers / docks /
  scopes. The peer route (`arch@<hub>`), the local route (`operator`) and the hub's self
  branch (`arch` or `operator`) all call it; the reply shape is the same everywhere.
- **Synchronous, with a long timeout** rather than a job like upgrades: the arch's contract
  is "when it is finished, the row is there"; a clone of a normal repo is seconds, the
  dedicated `Slow` HttpClient (15 min) covers a big one, and the service serializes calls
  per harness so two concurrent asks cannot clone twice.
- **Idempotency by remote, not by name.** A folder that already is a checkout of the SAME
  remote (any spelling: https/ssh/.git/userinfo) is reused; a different remote or loose files
  is `folder-conflict` — the name alone is never enough to overwrite anything.
- **Tokens never in the URL.** `ValidateUrl` refuses userinfo in http(s) URLs; `Display`
  strips userinfo before any detail or log line; git runs with `GIT_TERMINAL_PROMPT=0` and
  `GCM_INTERACTIVE=never`, so a missing credential is `auth-missing` within seconds, not a
  hang. The machine's own credential setup is the only way in.
- **The hub's scope add is unconditional on success** (`provisioned` or `exists`): the brief's
  end state is "in the hub arch's scope", and a reused agent that was not yet in the hub's
  scope should be after the call. `addedToHubScope` says which happened.
- **Forced describe before posture.** `upgrade_peer` reads the 5 s cache; here the peer's
  operator typically flips the opt-in moments before the ask, so `FleetClient.Refresh` runs
  first (the e2e caught the stale `not-accepting`).
- **The row is the `list_agents` row.** `ToolListAgents`'s projection became `AgentRow`;
  the reply's `agent` is that, read fresh after `RefreshAgentSnapshot` (self) or
  `FleetClient.Refresh` (peer), so handle / branch / availability / managedThere / sendable
  are what the arch would read on its next `list_agents`.
- **Dashboard = the same endpoint minus the armed rule**, like `fleet/upgrade`; disabled with
  the reason (dark, not opted in, sends not allowed) instead of failing on click.

## Removal (the mirror)

Dock: `DELETE /api/dock/{tabId}`; project: `DELETE /api/repos/{repoId}` (keeps the folder);
scope: `POST /api/arch/scope` without the id (peer: `repoIds`; hub: `fleet` without the key);
then delete the folder. The e2e does exactly this.
