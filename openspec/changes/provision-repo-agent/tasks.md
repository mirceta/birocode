## 1. Every harness

- [x] 1.1 `RepoProvisionService`: validate URL (no credentials), name, sibling parent, folder classification, clone with prompts disabled, register project (provider default), dock, local scope; idempotent steps; named refusals.
- [x] 1.2 `POST /api/fleet/provision-repo` (operator) and `POST /api/arch/peer/provision` (fleet, behind the opt-in + gate).
- [x] 1.3 Opt-in `AcceptFleetProvisioning`: state store, `POST /api/arch/fleet`, describe `acceptsProvisioning`, Arch tab checkbox, Status facts + Overview rows, `list_machines`, fleet state.

## 2. The hub

- [x] 2.1 `FleetClient.Provision` with a long-timeout client.
- [x] 2.2 `provision_repo_agent` tool (+ `ProvisionRepoAgent`, posture, forced describe, hub scope add, `AgentRow` reply); `POST /api/arch/fleet/provision` for the dashboard.
- [x] 2.3 Arch CLAUDE.md "The fleet" paragraph; `docs/agents.md`.

## 3. The dashboard

- [x] 3.1 Status → Agents per machine "+ new repo agent…" form + inline reply; Management bundle rebuilt.

## 4. Verify

- [x] 4.1 xunit `RepoProvisionTests`.
- [x] 4.2 `.claudeweb-preview/provision-e2e.ps1` (hub + peer on this box, real clone, 37 checks, removal).
- [x] 4.3 `client/tests/ui/shot-provision.mjs` screenshots.

## 5. Ship

- [ ] 5.1 PR; merge + deploy on the Operator's word. Peers need this build AND the opt-in before the hub's arch can provision there.
