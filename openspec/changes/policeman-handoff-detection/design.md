# Design — handoff endings

## D1. The eighth word, not a second reader

The policeman's reader answers ONE question per card with new words: which state, and why.
`handoff` is the eighth state in `CardObservations` — it flows through `CliCardReader.BuildPrompt`
(the state list is generated from the vocabulary; one rule sentence names the signals and the
`target` field), `Parse` (reads `target`), `CardReading` (+`Target`), `PolicemanSweep.Read`
(stamps `CardObservation.Target`) and the card's Agent section. No new prompt, loop, endpoint
or store.

## D2. Correlation makes the badge self-clearing

`Handoffs.FollowUpFor(card, obs, nodes, resolveTargetRepo)` — pure — answers "does a card exist
that this handoff called for?", in order of confidence:

1. a card whose title or note names the source card (#ref or id) — any age, any repo;
2. a card assigned to the target repo (the observation's `Target` resolved through the fleet's
   `ResolveAgent`; loose words like "a prg agent" resolve to nothing) created since
   `obs.At − 2 h` — the arch may have acted before the policeman read the words;
3. a card in that window whose title + note shares ≥ 3 significant words (≥ 4 chars, glue words
   dropped) with the summary.

Never the card itself, never a delivered card. The sweep runs it at the top of every card's
Read iteration (before any transcript read, so a silent agent's card still gets linked) and
right after a fresh `handoff` reading; a match writes `FollowUpId` with `onlyIfBy: policeman`.

## D3. The flag

`CardObservations.NeedsAttention` includes `handoff`; `ReasonFor` yields a reason only while
`FollowUpId` is null and the observation is older than the attention window. The existing
Flag mechanics (raise the loop's own 🆘, withdraw it when the reason is gone, never touch the
judge's or a human's stamp) are untouched.

## D4. Whose move

The policeman observes, verifies and flags; it never creates a card. The arch's role prompt
(v13) makes a pending handoff its cue to `create_task` for the named agent, quoting the handoff
and the source #ref — which is exactly what rule 1 or 2 then links. The Operator can do the
same from the board; the badge text says so.
