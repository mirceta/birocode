# Proposal: arch-goal-conversations — a goal is the arch agent on a timer, in its own conversation; repo agents stay passive

## Why

Repo agents waking the arch on every turn end was a mistake: everything landed in ONE
arch conversation, so while the Operator was giving it a new task a repo agent's turn end
arrived and the arch had to pivot — not top-down, and it hid whether the arch was free.
We now have several arch conversations and loops on them (openspec arch-conversations,
arch-driven-loops). Wanted (Operator, 2026-09-06, board task f9756383, then simplified
on the Operator's review the same day): run a goal loop on ONE arch conversation that
keeps checking the agents its goal depends on until the goal is genuinely finished;
while it runs that conversation is visibly unavailable; the Operator-facing conversation
stays free. **Keep it simple**: no event routing, no third component — the arch pings,
the agents answer.

## What

1. **Repo agents are passive.** They get a task or a question and answer it; they never
   call the arch. Unchanged from the dock's point of view.
2. **A goal conversation is the arch on a timer.** A goal opens its own conversation —
   from the Arch tab's Loops lane, or from the Operator-facing chat through
   `start_arch_goal(goal, repos, tasks, maxIterations)`. The existing goal loop runs on it
   (drive, capped). Every poll interval (the Loops lane's "re-prompt at least every"
   quiet floor, 5 min by default) the loop re-sends the goal; on each turn the arch
   checks its agents itself (`list_agents` for who is running, `read_transcript` for what
   a finished agent said, `list_tasks` for the board) and acts. A goal conversation is
   never woken by a repo agent's turn: its repeats wait for the floor alone. The
   conversation records the agents (managed keys) and board tasks it drives; an agent or
   task is driven by one running goal at a time. That shows on the conversation header,
   the Management App tab strip (⏳), the Status tab's Goal conversations card, the fleet
   chips and the agent docks ("driven by arch goal <id>").
3. **The Operator-facing conversation is a plain chat.** Nothing arrives in it on its own
   except a finished goal's summary. It lists goal loops, reads their status, starts and
   stops them (`list_arch_goals`, `stop_arch_goal`).
4. **Availability.** A goal conversation is "busy: goal <id>" while its goal runs and its
   loop is armed. Opening it shows a banner; the composer queues the text as an Operator
   message carried at the top of the loop's next poll, and offers a new goal conversation.
5. **Completion.** The loop ends when the arch says the goal is finished (`LOOP_DONE`) and
   its one verification turn agrees (`GOAL_VERIFIED`), or on the Operator's stop, the cap
   or an error; a person's decision is `NEEDS_HUMAN: <blocker>` (an escalated hold, the
   conversation stays busy). On end the conversation releases what it drove, becomes
   available, and one summary (goal, outcome, task statuses, its last reply) is posted to
   the Operator-facing conversation as one message (actor `goal`).
6. **Role prompt v7** gains "Goal conversations": the agents never call you; check them
   yourself every poll; never touch what you do not drive; end only when finished.

The one known downside, accepted: a goal conversation's transcript collects "nothing
changed yet" turns between polls. The upside is that the whole model fits in one sentence.

## Out of scope

Event routing of any kind (a repo turn waking a conversation, an inbox, a legacy switch);
a board-side veto on "done" (the kanban lifecycle columns are a separate change; the arch
reads the board with `list_tasks`); goals across machines other than through driven
fleet keys.
