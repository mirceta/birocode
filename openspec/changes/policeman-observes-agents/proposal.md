# The policeman reads every agent, writes what it saw on the card, and explains itself

## Why

The Operator (2026-09-16): "every policeman could prod, poll, get these messages, and
evaluate what the state actually is of that repo agent. They could then update the kanban
board … figure out what badge to put on the card — maybe the agent needs human assistance,
maybe something else." And: "it should be able to put a card from In progress to PR opened
if that has happened — this now happens all the time." And: "take care of good provenance
… now it's beginning to be a complex agent … add a visualization on its own tab that
explains what the policeman does — a state machine diagram if necessary — we need to
thoroughly understand what it's meant for and what it can and can't do."

The pieces existed (read_transcript on any fleet machine, flag, and — from
policeman-syncs-cards — sync_card), but the prompt only read transcripts for cards the
mechanical judge had already flagged, the only thing it could write from a transcript was
🆘, and nothing in the product explained the agent as a whole.

## What changes

1. **The sweep.** The prompt's step 2 is now READ EVERY AGENT: for every card in Doing,
   Committed or PR open with an assignee (not manual), read the agent's last four messages
   and judge from its own words. Step 3 (move cards to the facts) is run on every pass —
   "this happens all the time". Step 5 is the provenance rule.
2. **The Agent section on the card.** A new card field `observation` = {at, by, state,
   summary, sessionId} with a fixed vocabulary (`CardObservations`): working ·
   waiting-review · asked-question · blocked · claims-done · idle · errored. New tools
   `observe_card(id, state, summary)` and `clear_observation(id)` (policeman clears only
   its own; the Operator can dismiss from the card, `DELETE /api/taskgraph/nodes/{id}/observation`).
   The Kanban card renders it as an **Agent** section under the Board check: icon + word,
   the one-sentence summary, "seen by the policeman, N min ago · session <id>", ✕ dismiss.
   asked-question / blocked / errored are drawn as needing attention.
3. **Provenance.** Every observation carries the reader, the time and the policeman
   session that made it; the tool call is in History under that session; every summary is
   written to stand alone. The Board check already names its source; now the Agent section
   does too.
4. **"How it works" tab** in the Policeman subtab (Conversation | How it works): what the
   policeman is, the pass in order, TWO state-machine diagrams (Board check from facts;
   Progress and who may move it, including the policeman's forward move), the Agent
   vocabulary, a Can / Cannot table, and where its provenance lives. All of it is data in
   `policemanDiagram.js` rendered to SVG — the same data the understanding app renders,
   so the explanation cannot drift from the product.
5. **Understanding app** (`understanding-app/`) models the policeman ONE OWNER PER GRAPH, rendered by
   vendored cytoscape from `policemanMachines.js`: three DETERMINISTIC graphs where every box and arrow
   names the C# module and routine that owns it (1 the loop & lifecycle — AutopilotService /
   ArchAgentService.Policeman / LoopConfigStore; 2 card facts & the mechanical judge — TaskVerificationPoller /
   BoardVerifier / TaskLifecycle / BoardIntegrity; 3 tools & the three fences — ArchMcpServer /
   DisallowedToolsFor / the tools), and two PROMPT graphs labelled with their ArchPoliceman.Prompt step (4 the
   pass; 5 how it judges a card, saying which inputs come ready-made from code). The only places the two meet
   are the marked contract boxes (the model's turn) and the one contract arrow (NEEDS_HUMAN read back).
   Flowchart shapes; click a box to light its arrows; hover for the full "where". Validated by tests: every
   element names where it lives, a code graph has no model element but its contract boundary, a prompt graph
   is all the model's.

The policeman's allowed set is now 17 of 31 tools; the 14 acting tools stay withheld.

## Impact

- Backend: `CardObservations` (new), `TaskGraphService` (Node.Observation, SetObservation),
  `ArchAgentService.Policeman` (2 tools), `ArchMcpServer`, `ArchPoliceman` (policy + prompt),
  `TaskGraphController` (dismiss), list_tasks carries `observation`.
- Client: `cardSections.js` (OBSERVATIONS, observationOf), `KanbanBoard.jsx` (Agent section),
  `PolicemanPanel.jsx` (views), `PolicemanExplainer.jsx` + `policemanDiagram.js` (new).
- Tests: `CardObservationTests`, `ArchPolicemanTests`, `policemanDiagram.test.mjs`,
  `cardSections.observation.test.mjs`; evidence scripts extended (+2 and +2 checks, explainer screenshot).
- Specs: `arch-agent`, `task-graph`. Builds on `policeman-syncs-cards` and `kanban-card-sections`.
