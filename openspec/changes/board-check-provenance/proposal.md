# The Board check, made provenant

## Why

The Operator (2026-09-16), seeing "Board check" on the cards: "what the hell is that — is this the
policeman or some other independent mechanism that does the same thing? Because if there are two
things and one was hidden this is another horrifying fact."

It is a second mechanism, and it was hidden. The auto-verifier (openspec kanban-lifecycle-columns,
board-verify-remote) plus its mechanical judge (kanban-board-integrity) is harness code that runs
every 60 seconds: it reads git and GitHub, moves cards forward to the facts, judges every card
honest / not verified / stuck / manual, and stamps 🆘 on stuck ones. It predates the policeman
conversation, the commit that introduced it called it the "policeman" checker, and its stamps were
signed "policeman" — the same word the conversation later inherited. The product showed it only as
a stamp on the card and one line in the board header. There was no place to see it as a mechanism:
no history, no explanation, and the Policeman tab showed only the chat, so a reader concluded the
chat was the policeman.

Worse, sharing one actor name was a bug: the judge withdrew any "policeman" flag from a card that
was not mechanically stuck — including the flags the conversation raised for its own reasons
(a card lying about its column), which it therefore cleared within a minute.

## What changes

- **Its own actor.** The mechanical judge stamps and clears under `board-check`; `policeman` is
  the conversation's alone. The judge never touches the conversation's flag again. A pre-split
  "policeman" stamp with a mechanical reason is recognised as the judge's and migrated on the next
  pass. The card's Board check section names the loop as the auto-verifier either way.
- **A journal.** Every verifier pass is recorded — when, what set it off (startup · the minute
  timer · you pressed Re-verify · the policeman synced a card), how long it took, what it checked,
  every card it moved, every 🆘 it raised or cleared, the verdict counts, any error. Quiet passes
  fold into a run ("59 quiet passes, 62 min → 4 min ago") so a day stays readable; the pass count
  stays exact. Bounded to 400 entries, persisted, survives a restart.
- **Its own subtab.** The Kanban gets 📋 Board · 🔎 Board check · 👮 Policeman. The Board check
  subtab shows: a bar (what it is in one line, its state, last and next pass, Run a pass now); the
  live verdict; the history table; a card picker that turns the history into that card's timeline;
  and "What it is" — the loop in five steps, what it writes on a card, what it never does, and the
  two checkers side by side (runs · reads · decides by · writes · can be wrong by · history).
- **The board header** says 🔎 for the Board check, not 👮.
- **The Understanding app** gains tab 4, "Two checkers → one": today's two writers on one card and
  the merged loop proposed in openspec `one-policeman`.

## Impact

- API: `GET /api/taskgraph/boardcheck[?card=]` (status, verdict, journal, cards seen).
  `POST /api/taskgraph/verify` unchanged, now journaled as the operator's.
- Storage: `boardcheck.json` in the data dir, beside `taskgraph.json`.
- Cards: flags raised by the judge now carry `by: "board-check"`. Old ones migrate on the next pass.
- Not in scope: merging the two checkers — that is `one-policeman`, proposal only for now.
