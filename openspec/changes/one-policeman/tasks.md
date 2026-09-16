## 0. Decide

- [x] 0.1 The Operator read the proposal and clicked through the demo of the tab (2026-09-16): "ok fine that looks much better. build me that".
- [ ] 0.2 De-risk in the field: watch the reader's answers in the History for a few days; the loop runs with reading on by default, and `Stop reading` keeps the facts, moves and mechanical flags without a single model call.

## 1. Build (after 0)

- [x] 1.1 PR tracing inside the pass (`PolicemanSweep.Trace`, before the verifier; at most one GitHub listing per repo per five minutes).
- [x] 1.2 The one question: `ICardReader` / `CliCardReader` (one `claude -p` per card with new words, JSON out, validated against the seven states); `PolicemanJournal.Question` rows with the answer and the tokens.
- [x] 1.3 The Agent section written by the loop (`PolicemanSweep.Read`); flags by rule informed by the reading (`PolicemanSweep.Flag`: unanswered / blocked / errored past two hours; column against the facts for two sweeps); the judge keeps the mechanical stuck rule; one actor name, `policeman`.
- [x] 1.4 The conversation retired: lifecycle, prompt, fences, identity, tools, the arch hooks, the seven MCP tools, the policeman endpoints and state, the chat subtab and its explainer. The Kanban has 📋 Board · 👮 Policeman; the Policeman tab is the loop's face (Sweep · History · What it is), with the answer box on a flagged card (`POST /api/taskgraph/nodes/{id}/answer` → the agent, in the Operator's name) and reading on / off, model and tail as settings.
- [x] 1.5 Understanding app: the parts · the loop · each card · before (two checkers → one).
- [x] 1.6 Tests: `PolicemanSweepTests` (trace, one question per card with new words, reading off / refusal / budget, flags by reading and by two sweeps, the reader's prompt and parser, the transcript flattening), `PolicemanJournalTests`; client `policemanLoop.test.mjs`, `policemanStateMachine.test.mjs`; UI `shot-kanban-policeman-loop.mjs`, `shot-understanding-policeman.mjs`.

## 2. Ship

- [ ] 2.1 PR; merge + deploy on the Operator's word.
