## ADDED Requirements

### Requirement: A harness provisions a repo agent from one call
Every harness SHALL expose `POST /api/fleet/provision-repo { url, name?, parentFolder?, defaultBranch? }` that clones the repository as a sibling of the checkouts registered there (or into `parentFolder`), registers it as a project with the machine's usual provider, opens its dock (the repo agent) and adds it to that machine's arch scope, answering `provisioned` with the repoId, handle, path, branch and a `done | reused` step list. The call SHALL be idempotent — a checkout of the same remote, an existing registration, dock or scope entry is reused, never duplicated, and when every step is reused the answer is `exists`. It SHALL refuse with a named status: `bad-url` for anything but a plain https/ssh clone URL and for any URL embedding credentials (never cloned, never echoed), `folder-conflict` when the folder holds another repository or loose files, `disk-full`, and `auth-missing` / `url-unreachable` / `not-found` / `clone-failed` read off git's failure, with git never waiting on a credential prompt.

#### Scenario: A new repo, twice
- **WHEN** the call is made for a URL and name that are not on the machine, then made again identically
- **THEN** the first answer is `provisioned` with clone, project, agent and scope `done`, and the second is `exists` with every step `reused` and one registration, one dock, one scope entry

### Requirement: A fleet arch provisions on a peer behind its opt-in
A harness SHALL accept the same provisioning from a fleet arch at `POST /api/arch/peer/provision` only when its operator has enabled **accept fleet provisioning** (reported as `acceptsProvisioning` in the describe, the Arch tab, the Status tab's facts and `list_machines`) and the gate is open, answering `not-accepting` otherwise. The hub's arch SHALL have `provision_repo_agent(machine, url, name?, parentFolder?, defaultBranch?)`, refused unless its loop is armed and sends to that machine are allowed, answering `unreachable` / `no-peer-api` / `not-accepting` from a fresh describe before dialling; `machine` may be `self`. On `provisioned` or `exists` the hub SHALL add the agent to its own scope and reply with the resulting `list_agents` row (handle, branch, availability, managedThere, sendable) and what was done; the Status tab SHALL offer the same per machine as "+ new repo agent…", disabled with the reason when the machine cannot take it.

#### Scenario: One instruction, ready to dispatch
- **WHEN** the Operator tells the hub's arch "we need a new repo agent X on M for <url>" and M's operator has enabled accept fleet provisioning and the hub may send to M
- **THEN** the arch calls `provision_repo_agent(M, url, X)`, M clones, registers, docks and scopes X, the hub's scope gains M/X, and the reply names the handle `M/X` on its default branch, clean, `managedThere: true`, `sendable: true`
