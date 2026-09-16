# The policeman as an arch conversation: provenance and control for the board checker

## Why

`kanban-board-integrity` gave the board a mechanical policeman: a second step of the
verification pass that judges every card from the recorded facts and stamps stuck ones.
It works, but it is invisible and unaccountable: the Operator cannot see what it is doing
or what it has done, cannot ask it anything, cannot stop it, and it never explains a
verdict. The Operator's ask (2026-09-16): the policeman must have **provenance and
control** — it is an agent like the arch agent, always running the same loop ("is the
Kanban honest?"), and the harness already has everything such an agent needs: arch
conversations, driven loops, tool-call history, the loops lane, the kill switch, the
audit. Reuse that; do not build a second agent runtime.

## What changes

- **A reserved arch conversation, `@arch:policeman` ("👮 Policeman").** Created on first
  start with a fixed id and name (`ArchStateStore.EnsureConversation`), never removable
  or renamable from the Arch page, hidden from the Management App's sibling tab strip
  because it has its own home: a **subtab of the Kanban** ("📋 Board | 👮 Policeman").
- **The forever loop is the engine's recipe loop.** `StartPoliceman` arms a recipe loop
  on that key with ONE fixed prompt (`ArchPoliceman.Prompt`, the board goal inlined) and a
  sentinel it is told never to write; the engine re-sends it every interval (a
  per-conversation quiet floor, default 5 min) through the same mechanics as any arch
  driven loop — kill switch, Stop, audit, `NEEDS_HUMAN:` hold. A per-tick `PolicemanTick`
  keeps it alive: re-armed when the recipe cap is hit or after an errored turn (cooldown),
  never over the Operator's Stop or while it waits for their answer.
- **Observe-only tool policy.** The MCP URL now names the conversation; the server refuses
  every mutating tool for the policeman (send/dispatch/update/assign/create/delete task,
  idea_to_task, adopt_branch, upgrade_peer, loops, goals) with status
  `policeman-observe-only` and the reason. It may read (`list_*`, `read_transcript`,
  `git_state`, `recall`) and flag through three new tools: **`board_integrity`** (the live
  mechanical verdict + every card carrying a human request + the goal), **`flag_needs_human`**
  (stamp by the policeman, refused on manual cards, never overwrites another raiser) and
  **`clear_needs_human`** (withdraws only its own stamps).
- **Context cap + rollover.** `RunSession` records the CLI's last `usage.contextTokens`;
  after every policeman turn the harness checks it against the cap (default 400k tokens,
  settable) and a turn-count fallback. Over the cap it ROLLS OVER: the current session is
  closed in the sessions list with the reason, the conversation's session id is cleared so
  the next prompt starts a fresh CLI session, and that prompt is prefixed with a mechanical
  handover (which session ended and why, the board's verdict now, every card carrying a
  request). Nothing that matters is lost: the policeman's state lives on the cards, and the
  old session's transcript and tool calls stay readable by session id.
- **The Kanban's Policeman subtab.** A control strip — state pill (armed / turn running /
  waiting for you / errored / stopped), interval, last pass, context vs cap with a meter,
  session number and rollovers, ▶ Start / ■ Stop / 👁 Check now / ↻ Roll over, the interval
  and cap settings, the live verdict, the exact prompt and the allowed tools — a **sessions
  strip** (every session: turns, context, why it ended; click one to read its tool calls)
  and, below, the SAME `Arch` page the Arch tab uses (chat · tools · history · loops) for
  the policeman conversation: talk to it, read every tool call, stop its turn, see its loop.
- **The mechanical policeman stays.** The verifier pass keeps judging and stamping every
  minute (it is what `board_integrity` returns); the conversation is the accountable layer
  on top that confirms, explains and talks.

## Impact

- Backend: `ArchPoliceman` (pure rules), `ArchAgentService.Policeman` (start/stop/check/
  settings/tick/rollover/tools), `ArchStateStore` (reserved conversation, policeman
  bookkeeping incl. sessions), `ArchMcpServer` (conversation-aware policy, 3 tools),
  `ArchController` (`/api/arch/policeman*`, `conv` on the MCP URL, `policeman` flag on
  conversations), `AutopilotService` (tick, per-key quiet floor, conversation-tagged MCP
  config), `RunSession.LastContextTokens`.
- Client: `PolicemanPanel` + `KanbanTab` subtabs, `Arch.jsx` (reserved conversation),
  `ArchHistoryPanel` (`sessionOverride`), `ManageApp` (strip filter).
- Specs: `arch-agent` (the policeman conversation, its policy, the rollover).

## Out of scope

Per-card "ask the policeman" shortcuts, notifications outside the dashboard, and the
`request_human` composition (still `kanban-board-integrity` follow-up 4.1).
