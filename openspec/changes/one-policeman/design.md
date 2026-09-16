# Design — one policeman (proposal stage)

## D1. The loop, as the Understanding app draws it (tab 4)

every 60 s → for each in-flight card: read the facts (git · GitHub · deploy log · its PR, traced)
→ move it forward → new messages from the assignee? → yes: ask the model one question → write the
Agent section → stuck, or column against the facts? → yes: 🆘 with the reason → next card.
Exactly one box is the model's.

## D2. The question

Input: the card (title, column, verified state), the assignee's last N messages since the last
observation, the seven states with one line each. Output: `{ state, summary }`, validated against
`CardObservations` before it is written; an invalid answer is journaled and ignored. Temperature
low; the prompt is a constant; the call is stateless.

## D3. What is deterministic, listed

Timing, which cards are visited, the facts, every move, the mechanical stuck rule, when the model
is asked, how its answer is validated, every write and every stamp, every flag, the journal.

## D4. What is the model's, listed

Naming the state an agent is in from its own words, and the one-line reason.

## D5. Open questions for the Operator

- Keep an optional "ask the policeman" that routes to the arch with the card's context, or drop it?
- The number of messages per question (four today), and whether the classifier may request more.
- Whether a dishonest column (ahead of the facts) should flag after one sweep or two.
