# add-arch-agent

## Why

Today the Operator fans work out by hand: one dock per repo, one conversation each,
every check-in and re-prompt typed by a human. The harness already has every piece
of a middle-management layer — a per-repo run slot, a loop engine that sends prompts
as a non-human actor with a deny fence and audit, and a harness event feed that
announces when any agent starts and finishes — but nothing sits above the repo
agents and uses them together. An **arch agent** closes that gap: one standing agent
the Operator talks to, which assigns work to repo agents, waits for them via the
feed, reads their replies, and reports up. It is deliberately built as a single-
machine layer first, shaped so the next task (a fleet arch agent across computers)
is a change of scope rather than a redesign.

## What Changes

- **New: the arch agent** — a standing Claude session, bound to this machine and not
  to any repo, whose only medium toward repos is conversation with their repo agents
  (`send_task`, `read_transcript`, `list_agents`, `git_state`). It has no file or git
  power over any managed repo.
- **New: an arch home repository** — a separate git repo folder under the Projects
  Root (sibling of the harness repo, never inside it) that is the arch agent's cwd and
  the only place it may write: memories about repos, assignment records, notes.
- **New: the availability rule** — a managed repo is *available* only when its run
  slot is free **and** its checked-out branch is either the repo's default branch or a
  branch recorded in the arch home as created for an arch-assigned task. A repo on any
  other branch is *claimed by the Operator*: the arch agent neither sends to it nor
  reads its transcript.
- **New: the arch loop** — one more `ILoop` kind, keyed to the machine (reserved key
  `@arch`) instead of a repo. On the engine's existing tick it reads the collector's
  event feed past a persisted watermark; `turn.start` / `turn.ended` on managed repos
  become a wake prompt and one arch turn. `chat.focus` is not consumed. The existing
  deny fence, drive cap, suggest/drive mode, disarm (kill switch) and audit apply
  unchanged with kind `arch`.
- **Contention is the run slot, nothing else** — the arch agent is just another
  driver of a repo's builder lane. A busy target returns *busy* to the tool; the arch
  agent re-sends after the `turn.ended` wake. To take a repo back the Operator stops
  the arch agent, lets the running repo turn finish, and types.
- **Modified: chat bubbles carry an actor** — user bubbles emitted by non-human
  senders are tagged (`loop` today, `arch` now), and the dock renders the tag so
  provenance is visible in the repo agent's own transcript.
- **Modified: the event feed gains `arch.wake`** — published when the arch loop wakes
  the arch agent, so the fleet board, sounds, and the future fleet arch can observe
  the middle layer with no reader change.
- **New: the Arch tab** — a top-level surface (Advanced mode) holding the arch
  conversation, a managed-agents strip (slot state, branch state, who last drove,
  link to the real dock), the scope picker, and the same arm / mode / cap / stop
  controls the docks have.
- **Modified: loop-eval gains an `arch` scenario** — the ship gate. Real engine, real
  arch agent, real repo agents on committed fixtures, machine-scored, listed in the
  Autopilot console's Tests tab E2E section so the Operator can start it and watch
  it in the real UI.

## Capabilities

### New Capabilities
- `arch-agent`: the arch agent's identity and home repo, its tool surface and
  power limits, the availability rule, the arch loop (feed-driven wake-up, fence,
  cap, kill switch, audit), the contention rule, and the Arch tab.

### Modified Capabilities
- `chat`: user bubbles carry a sending actor (`human` implied, `loop`, `arch`) that
  the dock renders.
- `harness-event-feed`: a new `arch.wake` event type on the existing envelope.
- `loop-eval`: a new `arch` scenario (`tests/loop-eval/arch.mjs`) with its fixtures
  and assertion contract.
- `loop-eval-ui-runner`: the E2E eval section lists and starts the `arch` scenario.

## Impact

- **Backend** (`ClaudeWeb.App`): new `ArchLoop : ILoop` and an arch instance in
  `LoopConfigStore` under the reserved key; a small `ArchAgentService` (home repo,
  managed set, assignment records, availability); an MCP tool set exposed to the arch
  session via the existing `--mcp-config` path; `AutopilotService` send path
  parameterised by actor; `HarnessEventFeed` publishes `arch.wake`; new
  `ArchController` for the tab.
- **Frontend** (`client`): `archTab` capability (`advanced`) in
  `UiModeContext.jsx`; new Arch page; dock chat renders the actor tag.
- **Tests**: unit tests on `ArchLoop.Decide` and the availability rule;
  `tests/chat-systest` scenarios for actor tag and busy target;
  `tests/loop-eval/arch.mjs` + fixtures; `LoopEvalRunnerService.Scenarios` gains
  `arch`.
- **Docs**: `understanding-app/` (already rolling), `docs/event-feed-contract.md`
  (new type), README of `tests/loop-eval`.
- **Not touched**: the collector stays strictly read-only toward watched harnesses;
  repo agents, docks and the run slot are unchanged apart from the actor tag.
