# Human delegation + watchers: a repo agent can hand a blocker to a human and get resumed when it is resolved

## Why

Two ideas arrived together and are best kept apart:

1. **Watchers** — a new *kind* of loop. Every loop the harness has today (💡 suggestion,
   📋 recipe/queue, 🎯 goal, the arch's own driven ladder) is a **prompter**: on a
   timer it decides the agent's *next prompt* and sends it. A watcher is the
   opposite shape: it **checks a condition on a timer and reacts only when the
   condition becomes true** — a *hook*, not a prompt schedule. Nothing in the harness
   does this yet.
2. **Human delegation** — the first watcher worth having. Today a repo agent that hits
   something only a human can do (a credential, a merge, a decision, a physical
   action) can only end its reply with `NEEDS_HUMAN: <question>`. The engine treats
   that as a **hold**: the loop parks, the question is shown on the dashboard, and
   that is the end of it. Nobody tracks whether the human did the thing, nothing
   tells the agent when it is done, and the agent never resumes by itself. The human
   has to notice, act, and then come back and re-prompt the agent by hand.

Delegation closes that gap with four small pieces that map onto things the harness
already has:

| piece | what it is | reuses |
|---|---|---|
| **a tool** the repo agent calls when it is blocked on a human | `request_human(title, why, what_to_do, how_to_verify)` → returns a request id | the arch's in-process MCP tool server pattern (`ArchMcpServer`, bearer-authenticated, injected per turn) — repo agents get their own small harness tool server for the first time |
| **a place** the request lives | a card on the existing task board with a **human** assignee ("Operator"), status `todo`, carrying the four fields | the task graph + Kanban (cards, statuses, verification badges); the human resolves it where they already work — move the card to done, optionally with a note |
| **a watcher** that checks it | a per-agent loop of kind `watch` with condition `human-request-resolved(requestId)`; ticks with the autopilot engine, polls the card, does nothing until it is resolved | `ILoop` + the engine's tick, kill switch, audit and dedup mechanics — a watcher is one more `ILoop` implementation whose `Decide` returns *hold* until the condition fires |
| **a reaction** when it is resolved | one driven send to the same agent: "Your request *<title>* was resolved by the Operator: <note>. Continue." — then the watcher retires itself | the existing driven-send path (`AutopilotService` → `RunAsync` with the repo's engine), so it works for claude and codex agents alike |

The "Loops" tab in the agent dock is the **surface** for watchers: for *this* repo
agent, which watchers are armed, what each is waiting for, when it last checked,
what it saw, and what it will do. It sits next to Builder / Ask / Files / Console /
OpenSpec / Tools and is deliberately separate from the existing loop popover, which
stays the home of the prompting loops.

## What Changes

- **A repo-agent tool server.** A harness MCP endpoint for repo agents (the arch's
  server shape, scoped to one repo), injected into builder-lane turns alongside the
  Tools-lane servers. First tool: `request_human`. Second tool: `check_human_request`
  (so an agent can also ask synchronously, e.g. at the start of a resumed turn).
- **Human requests on the board.** A task-graph card kind for a human request:
  assignee = the Operator (a new, non-agent assignee kind), status lifecycle
  `todo → done` (with `note`), created by the tool, listed and resolvable on the
  Kanban like any card. `list_tasks` shows them to the arch too.
- **Watchers as a loop kind.** `LoopConfigStore.KindWatch` + a `WatchLoop : ILoop`
  whose `Decide` evaluates a **condition** and, when true, yields a **reaction**.
  First condition: `human-request-resolved`. First reaction: `resume-agent` (one driven
  send carrying the resolution). Bounded: a watcher has an interval, a max age, and
  retires after its reaction fires or when its card is deleted.
- **The dock "Loops" tab.** Lists this agent's watchers with condition, state (waiting
  / fired / retired), last check, last observation, next check; lets the Operator stop
  one. Read-mostly; watchers are created by agents, not hand-authored (for now).
- **Agent guidance.** The repo-agent briefing (and `docs/loop-driven-agent-convention.md`)
  gains the rule: *when you are blocked on a human and the harness tools are available,
  call `request_human` instead of (or before) `NEEDS_HUMAN:`; the harness will resume
  you when it is resolved.* `NEEDS_HUMAN:` stays as the fallback for agents without
  tools.

## Impact

- **Backend:** `ClaudeWeb.App/Services/Agents/RepoAgentMcpServer.cs` (new, modelled on
  `ArchMcpServer`), `ChatController`/`AutopilotService`/`ArchAgentService` (inject the
  repo tool server alongside the Tools-lane config — the `mcpServers` JSON already
  merges), `TaskGraphService` (human assignee kind + note on resolve), `LoopConfigStore`
  (`KindWatch`, condition/reaction fields), `WatchLoop`, `AutopilotService` (watch
  ticks + the resume send), new `GET/DELETE /api/repos/{id}/watchers`.
- **Client:** dock "Loops" tab (`PinnedAgent.jsx` + a `WatchersPanel`), Kanban card
  chrome for a human assignee (badge + "Resolve with note"), i18n, `UiModeContext` flag
  `dockLoopsTab` (Advanced).
- **Specs:** `autopilot-loops` (the watch kind), `task-graph` (human requests), a new
  `repo-agent-tools` capability (the tool server + `request_human`), `agent-dock`
  (the Loops tab).
- **Out of scope for the first slice:** hand-authored watchers with arbitrary
  conditions (file changed, URL healthy, PR merged…), notifications outside the
  dashboard (mail/chat), and the Codex-side management fence. The watcher shape is
  designed so those conditions can be added as further `condition` kinds without
  touching the tab, the engine, or the tool.

## Open decisions (to settle before design)

1. **Where the human resolves it.** Proposal: the Kanban card (move to done, or a
   "Resolve" button that takes an optional note). Alternative: a dedicated
   "Requests" inbox. The card keeps one board for all work and lets the arch see
   human blockers with `list_tasks`.
2. **Who the human is.** Proposal: a single "Operator" assignee for now (this box's
   human), not per-person accounts.
3. **Resume semantics.** Proposal: the reaction is a normal driven send on the agent's
   existing conversation (same session id, same engine), gated by the engine kill
   switch and the per-repo run slot like any driven send. If the agent's conversation
   was on another engine since, `SessionOwnership` already starts a fresh one.
4. **Watcher lifetime.** Proposal: interval 60 s, max age 7 days, retire on fire /
   card deleted / Operator stop; retired watchers stay listed (greyed) for a day.
