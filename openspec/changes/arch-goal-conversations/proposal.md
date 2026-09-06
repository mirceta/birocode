# Proposal: arch-goal-conversations — top-down arch: goal conversations own repos and tasks; events route to the owner, never to the Operator's chat

## Why

Repo agents waking the arch on every turn end was a mistake in one respect: everything
landed in ONE arch conversation. While the Operator was giving it a new task, a repo
agent's turn end arrived and the arch had to pivot — not top-down, and it hid whether
the arch was actually free. We now have several arch conversations and loops on them
(openspec arch-conversations, arch-driven-loops). Wanted (Operator, 2026-09-06, board
task f9756383): run a goal loop on ONE arch conversation that keeps looping and pinging
the agents its goal depends on until the goal is genuinely finished; while it runs that
conversation is visibly unavailable; the Operator-facing conversation stays free.

## What

1. **Goal-scoped arch conversation.** A goal opens its own conversation — from the Arch
   tab's Loops lane, or from the Operator-facing chat through `start_arch_goal(goal,
   repos, tasks, maxIterations, requireMerged)`. The existing goal loop runs on it
   (drive, capped, the arch's dynamic pacing). The conversation records the repos
   (managed keys, this machine or a fleet source) and board tasks it OWNS for the goal's
   duration; a task's assignee is owned with it. Ownership shows in the Management App's
   tab strip (⏳ + the goal on hover), the conversation header ("busy: goal <id> · owns
   …"), the Status tab's Goal conversations card, the fleet chips and the agent docks
   ("driven by arch goal <id>").
2. **Event routing instead of broadcast.** A repo turn, a loop event or a task status
   change (`task.status`, new on the feed) wakes ONLY the conversation that owns that
   repo or task — an early wake inside its own pacing. Events nobody owns go to the arch
   **inbox** (Status tab), never as a turn into any conversation. The Operator-facing
   conversation (the default) receives no repo wake-ups at all; it lists goal loops,
   reads their status, starts and stops them.
3. **Availability.** A goal conversation is "busy: goal <id>" while its goal runs and its
   loop is armed. `list_arch_goals` exposes id, goal, owner conversation, owned repos and
   tasks, state, iterations, last wake, queued messages. Opening a busy conversation shows
   a banner; the composer queues the text as an Operator message the loop reads on its
   next wake, and offers a new goal conversation.
4. **Completion.** The loop ends only when the agent's own verification passes AND, for
   board work, every owned task is at least `pr-opened` (`pr-merged` when the goal says
   so) per the kanban lifecycle — the order is declared in `TaskLifecycle` ahead of the
   lifecycle-columns change; today only `done` clears it. A done the board refuses sends
   the conversation back to work with the gap named; a person's decision is
   `NEEDS_HUMAN: <blocker>` (an escalated hold, the conversation stays busy). On
   completion (done · stopped · capped · error) the conversation releases its repos and
   tasks, becomes available, and a summary with its last reply is posted to the
   Operator-facing conversation as one message (actor `goal`).
5. **Migration.** The pre-goal behaviour — every armed conversation woken by every managed
   repo event — stays behind the setting **legacy broadcast** (Status tab; default off).
   Existing single-conversation setups keep working: the default conversation's standing
   wake loop simply holds until the Operator turns the legacy setting on or starts a goal.
6. **Role prompt v7** gains "Goal conversations": own your repos, poll on your pace, react
   to owned events, never touch unowned repos, end only on verified completion.

## Out of scope

The lifecycle columns themselves (`assigned`, `pr-opened`, `pr-merged` on the board —
pending feature/kanban-lifecycle-columns); goals across machines other than through
owned fleet keys; an inbox that wakes anyone.
