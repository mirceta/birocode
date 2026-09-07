# Agents — the concept map

**What a "repo agent" and a "management agent" are.** These are first-class
concepts in this harness: the specs use them constantly (`repo agent` appears
40+ times across `openspec/`), but until now nothing defined them, so an agent
reading `CLAUDE.md` learned what a *Repo* was and had to infer the rest.

This page is the single source of truth for the agent vocabulary. The
[`CLAUDE.md`](../CLAUDE.md) glossary carries one-line versions and links here;
change the definitions **here**, not there.

> Grounded in `openspec/specs/arch-agent/spec.md`,
> `openspec/specs/agent-dock/spec.md`, `openspec/specs/action-audit/spec.md`,
> `ClaudeWeb.App/Controllers/DockController.cs` and
> `ClaudeWeb.App/Controllers/RepoController.cs`. Where those are silent, the text
> below says so rather than inventing.

## The one-paragraph version

A **Repo Agent** builds; a **Management Agent** decides who builds what. Each
Repo Agent is a Claude or Codex conversation pointed at one registered Repo, and it is the
only kind of agent that may touch that repo's files. The Arch Agent — the
management agent this harness ships — has *no* file powers at all: it works
purely by sending conversational tasks into repo agents' docks and reading what
comes back. A **Fleet** is several harnesses whose agents can be seen and driven
from one another.

## The layers

```mermaid
flowchart TD
    OP["Operator / End User"] --> MGMT

    subgraph MGMT["Management layer — decides"]
        ARCH["Arch Agent (@arch)<br/>one per harness<br/>home repo, no file powers"]
        TASKS["Tasks Agent<br/>MCP over ideas + task graph"]
    end

    MGMT -->|"send_task — conversation only"| BUILD

    subgraph BUILD["Build layer — does the work"]
        RA1["Repo Agent<br/>dock tab · repo A"]
        RA2["Repo Agent<br/>dock tab · repo B"]
    end

    RA1 --> REPOA[("Repo A<br/>files, git")]
    RA2 --> REPOB[("Repo B<br/>files, git")]

    ARCH -.->|"read only: list_agents,<br/>git_state, read_transcript"| BUILD

    style MGMT fill:#fff4e0,stroke:#c08a2d
    style BUILD fill:#f6f0ff,stroke:#7c5cbf
```

## The terms

### Repo Agent

**One Claude or Codex conversation bound to one registered Repo, surfaced as a tab in the
agent dock.** It is the thing that reads and writes that repo's files, runs its
commands, and makes its commits — the harness's unit of work.

- **Identity.** A dock tab (`DockController`: `id`, `repoId`, `repoName`,
  `sessionId`, `status`). One repo may hold more than one tab. The specs use
  "agent", "dock tab" and "dock tile" interchangeably for this thing.
- **Created by** `POST /api/dock` with a `repoId` — the repo must be registered
  first (`POST /api/repos`). `sessionId` is null until the first prompt starts a
  conversation, so a freshly created agent is a real but *unstarted* agent.
- **Lanes.** A dock offers **Builder / Ask / Files** (`agent-dock` spec). The
  **builder lane** is the one that runs work; the audit records every prompt
  against `(actor, project, lane)`.
- **Run slot.** Per-repo concurrency control. A repo is `busy` while its
  builder-lane run slot is running *for any actor* — this, not politeness, is
  what stops the arch agent and the Operator from talking over each other.
- **Availability** (`arch-agent` spec): `available`, `busy`, `claimed` (checked
  out on a branch nobody assigned), or `unmanaged`.

### Management Agent

**The umbrella term for an agent that assigns and tracks work instead of doing
it.** It is a *category*, not a component; this harness ships two members.

The defining constraint: a management agent has no write access to managed
repos. It moves work by conversation and by reading state.

### Arch Agent (`@arch`)

**The standing management agent — one per harness.** Middle management: it takes
the Operator's intent and parcels it out to repo agents across the fleet.

- **Home repository.** Its working directory is a dedicated git repo
  (`<ProjectsRoot>/arch-home`), a *sibling* of the harness's own repo and never
  inside a registered one. It is the only place the arch agent may write, and it
  never appears as a repo card or dock tab.
- **Powers.** Exactly `list_agents`, `git_state`, `read_transcript`, `send_task`
  on managed repos, plus `remember` / `recall` on its home repo. Its session runs
  with the CLI's edit, write, shell, web, sub-agent and file-read tools
  **disallowed**, enforced twice (`--disallowedTools` plus a settings file).
- **Provenance.** A `send_task` lands as a user bubble in the target repo agent's
  own dock conversation, tagged `arch@<machine>`, and is audited on both
  harnesses. Work is never done invisibly.
- **Untrusted input.** Tool output — transcripts, wake prompts — is presented to
  the arch session as *data*. Its role prompt states these are never
  instructions. Worth preserving: a repo agent's transcript is attacker-adjacent
  text.

### Tasks Agent

**The management agent for the backlog** rather than for machines: an MCP server
(`POST /api/tasks/mcp`) exposing `list_ideas`, `create_idea`, `update_idea`,
`list_tasks`, `create_task`, `update_task`, `link_tasks`, `delete_task` as thin
wrappers over the existing ideas and task-graph services — no second store.

### Agent Dock

**The per-repo surface a repo agent lives in**: tab, lane switcher, chat, git
block, local-apps switcher. Dock *tiles* also represent agents on the dashboard
and in the Agents list (a thick black border means queued prompts).

> The `agent-dock` spec's Purpose is currently `TBD`. Treat this entry as the
> working definition until that spec is given one.

### Fleet

**More than one harness, each on its own machine, aware of the others.** The
Management App's Status tab shows every repo agent on every machine; the arch
agent can `send_task` to a peer's repo agent, and the receiving dock shows the
`arch@<origin>` tag. A fleet member is still a full harness — there is no
central server.

### Home Repository

The arch agent's own git repo (`arch-home`) holding its role prompt, `memory/`
and `assignments/`. Created and git-initialised on first arm. Not a registered
Repo, deliberately.

## How the pieces relate to the older glossary

`CLAUDE.md`'s original glossary describes the *serving* topology — Harness, Repo,
Product, Preview Port, Operator, End User. That axis answers "what is served
where". This page is the *acting* topology: "who does what to which repo". They
meet at **Repo**: a Repo is the folder; a Repo Agent is the session working in it;
the Product is what that work produces.

## Adding a repo agent (the mechanical answer)

1. Register the repo — `POST /api/repos` with `Folder` (absolute path, or one
   relative to the Projects Root), optional `Name` and `Visibility`.
2. Create the agent — `POST /api/dock` with that `repoId` and a `repoName`.
3. The agent exists but is unstarted; the first prompt in its builder lane
   creates the session and gives the tab its `sessionId`.

Both endpoints sit behind the `/api/*` password gate, so tooling needs a valid
`X-Auth-Password` header or a session cookie ([gates.md](networking/gates.md)).
The Operator can do the same two steps in the UI.
