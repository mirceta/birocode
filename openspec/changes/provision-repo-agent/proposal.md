# Fleet: a brand-new repo agent from ONE arch instruction

## Why

Fleet task 3bbd2242 (the Operator, 2026-10-07). Creating a genuinely new repo agent took
five hand steps: (1) create the GitHub repository; (2) have a birocode agent on the target
machine clone it as a sibling of the other checkouts; (3) register it there as a project
and as a repo agent; (4) add it to the hub arch's scope; (5) add it to the target machine's
own arch scope. Only (1) is a human step. The rest must follow from one sentence to the
hub's arch agent: "we need a new repo agent <name> on <machine> for <github url>".

## What the code says (verified)

- A repo agent on a machine = a registered project (`RepositoryRegistry.Add`, idempotent by
  path, assigns the stable handle) + a dock tab for it (`DockRegistry.Add`); the local arch
  scope is `ArchStateStore.ManagedRepoIds`; the hub's scope of a peer agent is a fleet key
  `<sourceId>/<repoId>` in `ManagedFleet`.
- The fleet channel is the peer API (`/api/arch/peer/*`, `FleetClient`), every logical
  outcome a 200 with a named status; the receiving-side opt-ins (`AcceptFleetSends`,
  `AcceptFleetUpgrades`) live in `ArchStateStore` and ride the describe, the Arch tab and the
  Status tab's facts grid. `upgrade_peer` is the model: hub-side posture (reachable, opted
  in, sends allowed, armed) → one POST → the peer applies its own rules.
- `list_agents` rows were an inline projection in `ToolListAgents`; the brief wants the same
  row in the provisioning reply, so the projection is now one method, `AgentRow`.
- The SPACEX4 `web-flow-autodev` remote holds a token in its URL — the pattern to refuse.

## What changes

1. **Every harness: `RepoProvisionService`** — one call: validate the URL (credentials in
   it → `bad-url`, never cloned, never echoed), derive the name, pick the sibling parent
   (the folder most registered repos share, ties → the self repo's parent; or an explicit
   `parentFolder`), classify the target folder (missing / empty → clone; same remote →
   reuse; other remote or files → `folder-conflict`), refuse on a nearly full drive
   (`disk-full`), `git clone` with prompts disabled (failures → `auth-missing` /
   `url-unreachable` / `not-found` / `disk-full` / `clone-failed`), register the project
   (provider = the machine's most common one), open the dock, add to the local arch scope.
   Idempotent: each step reports `done` or `reused`; all reused → `exists`.
   Reachable as `POST /api/fleet/provision-repo` for the machine's own operator.
2. **The peer route + the opt-in**: `POST /api/arch/peer/provision` behind a new
   **accept fleet provisioning** (`AcceptFleetProvisioning`, Arch tab checkbox next to
   sends / upgrades; `acceptsProvisioning` in the describe, the Arch tab's fleet state, the
   Status tab's facts and Overview rows, `list_machines`). The hub's POST waits as long as
   the clone takes (a dedicated 15-minute HttpClient, not the 8 s peer timeout).
3. **The arch tool `provision_repo_agent(machine, url, name?, parentFolder?, defaultBranch?)`**
   in the style of `upgrade_peer`: armed loop, sends allowed, a FORCED fresh describe (the
   peer's operator may have just opted in), posture (`unreachable` / `no-peer-api` /
   `not-accepting`), the call, then the hub adds `<sourceId>/<repoId>` to its own scope,
   refreshes the describe, and answers with the resulting `list_agents` row (handle,
   branch, availability, managedThere, sendable) plus what was done. `self` provisions
   locally and lands in the local scope. A paragraph in the arch's CLAUDE.md "The fleet".
   `POST /api/arch/fleet/provision` = the same minus the armed rule, for the dashboard.
4. **The dashboard**: Status → Agents, per machine, **+ new repo agent…** — a form (URL,
   name, parent folder), disabled with the reason when the machine cannot take it, and the
   reply inline: status, the steps, the agent row.

## Verification

- xunit `RepoProvisionTests` (URL rules incl. the token case and no echo, name, sibling
  parent, remote equality, folder kinds, git-failure vocabulary, provider default, hub posture,
  peer-reply repoId, the CLAUDE.md paragraph).
- `.claudeweb-preview/provision-e2e.ps1`: TWO isolated instances of this build (hub + peer
  PEERBOX, own data dirs), 37 checks — opt-in off → `not-accepting` before dialling; opt-in
  on; token URL → `bad-url` without echo; missing parentFolder named; hub → peer `provisioned`
  in ~1 s with a REAL clone of a small public repo (`mirceta/portlistener`) under
  `playground/provision-test-20261007`, all four steps done, handle `PEERBOX/…`, row
  managedThere + sendable + default branch + clean + available, hub scope and peer scope,
  project at the sibling path, dock opened, Fleet Status lists it; second call `exists` with
  every step reused and no duplicate registration; other repo into the same folder →
  `folder-conflict`; self path reuses the checkout and registers locally; the plain
  `/api/fleet/provision-repo` on the peer answers `exists`; the tool is catalogued and
  audited; then the test agent is removed again (dock, project, scope on both; folder deleted).
- `client/tests/ui/shot-provision.mjs`: the control on every machine (disabled with the
  reason on the dark one), the form, and the real captured reply rendered.

## Not done, on purpose

No GitHub repository was created for the test (standing rule: agents never create or delete
repositories under the Operator's account); an existing small public repo was cloned under
the test name instead. The GitHub repository stays the human's step by design.
