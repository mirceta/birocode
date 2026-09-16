# Design — the policeman observes agents

## D1. An observation is a reading, not a fact

The Board check is judged from facts (git, GitHub, deploy log) and has four states. The
Agent section is what the policeman READ in the agent's conversation — a reading of
words. They are kept in separate fields and separate card sections so the Operator never
confuses "GitHub says" with "the agent says". A reading never moves a card; only the
verifier does (through sync_card), and only forward.

## D2. Fixed vocabulary, free summary

`CardObservations.States` is the closed set the tool accepts; an unknown state is refused.
The summary is one sentence (≤ 300 chars) the policeman writes to stand alone, quoting
what it read and when. The card shows both: the word from the vocabulary in the section's
tone, the sentence beneath. `NeedsAttention` (asked-question, blocked, errored) drives the
amber tone and the prompt's flagging rule.

## D3. Provenance on the field itself

`CardObservation(At, By, State, Summary, SessionId)`: `By` is `policeman` (the tool stamps
it), `SessionId` is the open policeman session at the time (`ArchStateStore.Policeman.Sessions`),
so the card's "session a1f3c9d2" matches the sessions strip and the History lane, where the
`observe_card` call with its input and result is kept. `clear_observation` clears only the
policeman's own (`onlyIfBy`); the Operator's dismiss clears any.

## D4. The explainer is data

`policemanDiagram.js` holds two state machines (states with positions, edges with labels and
a bend), the pass, the can / cannot lists and the provenance map, plus a pure `toSvg`
(quadratic curves anchored on box borders, labels with a paint-order halo, one arrowhead
marker per diagram). The React tab renders `toSvg` output; the understanding app imports a
vendored copy of the same module. `validate` and the node test guard that every edge names a
known state and that the lifecycle never draws a backwards move.

## D5. Not changed

The engine, the loop, rollover, the tool fences and the verifier are untouched. The prompt
grew, so a pass reads more (tail 4 per in-flight card); the 400k cap and rollover absorb it.
