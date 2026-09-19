# Policeman: detect "handoff" endings — a conversation that concludes by calling for a NEW task on ANOTHER agent

## Why

An agent's conversation can END by handing the next step to someone else: "I wrote a handoff
for another agent to fix, then merge, and I'll pull it." That resolves the agent's turn — and
creates nothing on the board. Today the policeman reads such a conversation as *working* or
*says done*; the follow-up task the words call for is never created and the effort silently
falls through the cracks (it just happened on a web-flow-autodev card whose ending called for a
prg agent's fix).

## What changes

1. **One more observation state, through the same pipeline.** `CardObservations` gains
   `handoff` ("Handoff pending"): the reader's ONE question per card with new words now lists
   it, with a rule that names the signals — a handoff / task description written for another
   agent, "this needs a <repo> agent to fix X", "create a task for <someone>", "once their fix is
   merged I'll pull it" — and asks for a `target` (the repo / agent the follow-up is for, as the
   words name it). The parser reads it; the sweep stamps the card's Agent section with the
   summary and the target. Nothing else is new: the same transcript read, the same one model
   call, the same `SetObservation`, the same cadence.
2. **The badge stays honest: correlation, not nagging.** Every pass the sweep looks for the
   follow-up card a pending handoff calls for — a card naming the source card's #ref, a card
   assigned to the resolved target repo created since the reading (less a two-hour look-back,
   the arch may be faster than the policeman), or a card sharing three significant words with
   the summary — and records it on the observation (`followUpId`). The badge then reads
   "Handoff tracked — follow-up #ref exists" and is never flagged. Pure, unit-tested
   (`Handoffs`).
3. **A flag only while nothing answers it.** `handoff` joins the attention states: after the
   window (2 h) with no follow-up the card is 🆘 "ended in a handoff N ago and no follow-up task
   exists yet (for <target>): <summary>"; the sweep withdraws its own flag once a follow-up is
   linked, like every other attention flag.
4. **The arch's cue.** `list_tasks` carries `observation.target` / `observation.followUpId`;
   the role prompt (v13) tells the arch that a `handoff` observation without a follow-up is its
   cue to `create_task` for the named agent, quoting the handoff and the source #ref — after
   which the policeman links it and stops asking. `my_effort` (the repo-agent tool) carries the
   same two fields.
5. **The card.** The Agent section shows "🤝 Handoff pending — <summary> — for <target> · no
   follow-up task on the board yet — the arch or you should create it" (attention styling), or
   "Handoff tracked … · follow-up card #ref exists" once linked.

## Composition

- `one-policeman` / `policeman-observes-agents`: the vocabulary, the reader, the sweep's Read
  and Flag — extended, not forked. `feat/policeman-observes` and `feature/policeman-board-behind`
  are both on main already; this sits on top of them.
- `cross-repo-effort-legs` (PR #115): a handoff whose follow-up becomes a typed leg on the same
  card is a natural next step (Q: should the arch add a driven leg instead of a new card?) — not
  decided here; the correlation would then match the same card's new leg, which is excluded
  today (the card itself never counts).
- `kanban-external-owner` / manual: hands-off cards are never read, so never stamped.

## Impact

Backend: `CardObservations`, `TaskGraphService.CardObservation` (+Target, +FollowUpId),
`ICardReader.CardReading` (+Target), `CliCardReader` (prompt rule, target parsing),
`PolicemanSweep` (stamp target, correlate every pass, flag reason), new `Handoffs`,
`ArchAgentService` (list_tasks fields, role prompt v13), `RepoAgentToolbox`. Client:
`cardSections.js` (vocabulary, `observationOf`), `KanbanBoard.jsx` (data attributes); the
Management App bundle rebuilt. Tests: `PolicemanHandoffTests` (5), the vocabulary / prompt /
parser / role-marker tests updated, `cardSections.observation.test.mjs`.

## Out of scope

- Creating the follow-up task automatically (the arch or the Operator decides; the policeman
  only observes, verifies and flags — its contract).
- A handoff that names a HUMAN rather than an agent (that is `request_human`, openspec
  human-delegation-watchers).
