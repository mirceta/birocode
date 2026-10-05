# Repo-agent → arch requests: `request_arch`, the hub store, the Repo Agent Requests tab

## Why

Fleet task c84ae3db (the Operator, 2026-10-05): a repo agent has no way to ask its managing
arch for anything — a decision, a resource, another agent's help — without a human carrying the
message. It must not be a wake: the arch's conversation is the Operator's, and an agent that can
start arch turns is an agent that can spend the Operator's budget and attention at will. So: a
tool that only RECORDS a request, a place where the Operator sees every request from every
managed agent across the fleet, and a decision — approve (the arch sees it) or dismiss (it never
does).

## What the code says (verified)

- **Tools** live on the repo agents' `claude-web` MCP server: a toolbox method, a dispatch arm
  and a catalogue entry (`RepoAgentMcpServer`), the environment record handed in by
  `RepoAgentToolsService`; the Tools lane lists the catalogue from `tools/list`. Nine tools today.
- **Per-harness persisted stores** under the data dir are the pattern the hub file system
  set (`HubFileStore`: a JSON index, one lock, atomic rewrite).
- **The fleet channel runs hub→peer only** (`FleetClient` with the peer's stored credential; a
  peer has no credential for its hub). Hence anything an agent writes is written on ITS harness,
  and the hub PULLS (`ArchPeerController` routes, `FleetClient.Get/Post`), with writes on the
  peer behind its "accept fleet sends" opt-in.
- **The arch conversation has no message queue**: `ArchAgentService.SendToArch` starts a turn
  at once and refuses with "mid-turn" when the slot is busy. The one queue-like path is the goal
  summary: `_goalSummaries` drained by `DeliverGoalSummaries()` on the autopilot engine tick,
  one `SendToArch(ReservedId, text, ActorGoal)` per tick when the slot is free. That is the
  wiring for injecting a message into the Operator-facing conversation.
- **Management tabs** are `ManageApp.jsx`'s `TABS` + label + pane, i18n `manage.*`, a component
  that polls its endpoint every 5 s and skips hidden ticks (`FileSystem.jsx`).

## What changes

1. **`request_arch(text, title?)`** on the `claude-web` server (10th tool): records a row on
   this harness's `AgentRequestStore` (`%APPDATA%\ClaudeWeb\agent-requests.json`) — agent handle,
   machine, repo, created-at, title, text, status `pending` — audits it, and returns the row with
   "the arch is NOT woken". Refuses empty / over-long text, caps pending per agent at 20, answers
   an identical pending text with the existing row (`duplicate`). Nothing else happens.
2. **The store** persists every row and survives a restart; a decision is final
   (`approved` / `dismissed`, with when and by whom); `deliveredAt` marks the post into the arch
   conversation; decided rows beyond 500 are trimmed, pending never.
3. **The hub pulls** every active remote peer's locally recorded rows (`GET /api/arch/peer/requests`)
   on the engine tick (every 30 s) and when the tab reads (every 10 s), keeps those from repos
   in its fleet scope, and **pushes decisions back** (`POST /api/arch/peer/requests/decision`,
   behind the peer's accept-sends opt-in) so the agent's own harness shows the outcome.
4. **The Repo Agent Requests tab** (Management dashboard, `?tab=requests`): pending cards with
   agent/machine, title, text, Approve / Dismiss (dismiss asks first); the decided ones folded;
   each peer's last pull status; the how-to from the harness.
5. **Approve** marks the row and posts `ComposeRequestMessage(row)` into the default `@arch`
   conversation via `SendToArch(ReservedId, text, ActorRequest)` at once when the slot is free;
   otherwise the engine tick does it (`DeliverAgentRequests`, one per tick, like a goal summary).
   The message is tagged actor `request`, so the transcript shows the harness relaying an approved
   agent request. **Dismiss** closes the row; the arch never sees it.

## Out of scope

- An arch tool to list requests (the arch learns of a request only through approval).
- Agent-side notification of the decision beyond the store (the arch answers with `send_task`).
- Requests from agents on a peer that is not in this hub's fleet scope (they stay on that peer,
  whose own Operator can decide on its own tab).
