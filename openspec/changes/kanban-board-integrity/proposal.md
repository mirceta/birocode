# Kanban board integrity: a settable board goal, a "policeman" checker, a "human assistance requested" badge, and a per-card "go manual" toggle

## Why

The Operator wants to trust the Kanban: when they look at the board, the state shown must
be real. Today the harness already verifies cards against facts (the assignee's clone,
the PR on GitHub, the deploy log — openspec kanban-lifecycle-columns, board-verify-remote,
board-claims-advisory) and badges a card whose status is ahead of the facts. But:

- nothing states what the board is FOR, so nobody can judge whether its state makes sense;
- a card whose column is ahead of reality is one small ⚠ chip among many — not a verdict;
- an assignee that could not finish and could not open a PR just sits there: nobody
  concludes "this needs a human" and nothing shows the Operator which cards are waiting
  on them;
- there is no way to tell the harness "hands off — I am handling this card myself with
  that repo agent, directly": the arch keeps dispatching and the verifier keeps moving it.

## What changes

1. **Board goal.** The board carries a GOAL the Operator sets and edits in a panel above
   the Kanban (`PATCH /api/taskgraph/goal`). It is part of the fleet-synced board (last
   writer wins, like the scratchpad), and the arch reads it as `boardGoal` in
   `list_tasks` — the reference for judging whether the board's state makes sense.

2. **The policeman.** A board-integrity checker that runs as the second step of every
   existing verification pass (every minute, at startup, and on "Re-verify board"). It
   does not prompt, dispatch or move anything. It REUSES the facts the verifier just
   recorded and judges each card: **dishonest** (the column is ahead of what was
   verified — the same rule as the ⚠ unverified badge, now surfaced as a verdict with
   a 👮 chip and an amber card edge), **stuck** (pinged, no PR, and either the assignee
   reported `TASK BLOCKED` or it has been silent past the board's stale window),
   **manual** (not policed), else **honest**. The verdict (counts + flagged cards) rides
   the board poll and is shown beside the goal: "👮 checked 12 s ago · 5 honest · 1
   dishonest · 1 need human · 1 manual".

3. **"Human assistance requested".** ONE state on the card (`needsHuman`: when, by whom,
   why, optional request id). The policeman stamps it on stuck cards and withdraws only
   its own stamps when the card progresses; a repo agent's `request_human` (openspec
   human-delegation-watchers) and the Operator (a button on the card) raise the SAME
   state; the Operator resolves it on the card. It renders as a prominent 🆘 chip with a
   red card edge, a `needs human` filter flag, and `needsHuman` in `list_tasks` so the arch
   reports those cards each wake instead of re-pinging.

4. **"Go manual".** A per-card toggle (✋ on the card, "Go manual / Back to auto" in the
   detail; `PATCH /api/taskgraph/nodes/{id}` with `manual`). A manual card is dashed and
   chipped ✋; the verifier does not probe or advance it, the policeman does not judge it,
   the arch's `dispatch_task` and `update_task` refuse it (status `manual`), it never
   appears as `awaitingDispatch`, and the board's own Ping is disabled. The Operator drives
   that repo agent directly on its machine.

## Composition with openspec human-delegation-watchers (in flight, not merged)

That change gives a repo agent a `request_human` tool that files a human request as a
board card with a human assignee, and a watcher that resumes the agent when the Operator
resolves it. This change does not fork a second scheme: it defines the `needsHuman`
state on the WORK card that `request_human` should also set (`by: "agent"`, with the
request card's id in `requestId`) and that the watcher's resolution should clear —
so one badge, one filter flag and one `list_tasks` field cover a stuck assignee, an
agent's explicit request and an Operator's hand-raise alike. The policeman never
clears an agent's or the Operator's stamp. Until that change lands, `by` is
`policeman` or `operator` only.

## Impact

- Backend: `TaskGraphService` (`Goal`/`GoalUpdatedAt` on the board + snapshot + LWW
  merge; `Manual`/`ManualAt`/`NeedsHuman` on the node; `SetGoal`, `SetManual`,
  `SetNeedsHuman`), new `BoardIntegrity` (pure judge + apply), `BoardVerifier` (skips
  manual), `TaskVerificationPoller` (runs the policeman after each pass, exposes the
  verdict), `TaskGraphController` (goal, integrity, human raise/resolve, `manual` on the
  node PATCH), `ArchAgentService` (`boardGoal`, `manual`, `needsHuman` in `list_tasks`;
  manual refused by dispatch/update; role prompt).
- Client: Kanban goal panel + policeman line, 🆘 / ✋ / 👮 chips and card edges, manual
  toggle, needs-human raise/resolve, `needs-human` + `manual` filter flags.
- Specs: `task-graph` (goal, integrity, needs-human, manual), `arch-agent` (respects manual,
  reports needs-human, reads the goal).

## Out of scope (follow-ups)

- An LLM judgement of the board against the goal (the arch does this on wake with
  `boardGoal`; a dedicated goal-checking loop can be a watcher condition later).
- Notifications outside the dashboard for 🆘 cards.
- Relaying commit/push facts from peers (board-verify-remote's own follow-up).
