# Kanban card sections: labeled, self-explaining cards instead of badge soup

## Why

The Operator (2026-09-16): "Everywhere the cards are modeled with badges — who knows what
the badges are for. There's a badge 'Column ahead of reality' — what does that mean and
who put that there? The policeman? We just don't know." Fair: the board had grown a row
of unlabeled chips (⛔ blocked, ✓ prereq, 📣, ⏳ awaiting ping, 📎 label only, ⎇ branch, PR,
⏱ stale, ⚠ unverified, 🏛, 💡, 🆘, ✋, 👮 "column ahead of reality"), some of them raw
reason strings from the verifier or the policeman, none of them saying where they came
from. A card must be readable at a glance and every status must answer "who put that
there".

## What changes

Every card is restructured into a few labeled sections (`cardSections.js`, pure):

1. **Header** — `#ref` · editable title · assignee chip(s) (machine/agent identity +
   activity dot) — unchanged, one row.
2. **Progress** — the lifecycle plainly as steps: To do → Doing → Committed → PR open →
   Merged → Done, the current step lit (amber when it is ahead of the facts), passed
   steps tinted; under it one note: *blocked — waits on …* / *not assigned* / *pinged
   15 min ago* / *assigned — waiting for the arch to ping the assignee* / *repo label only*.
3. **Board check** — ONE clearly labeled status in plain English that always names its
   source and, when known, its time:
   - ✅ **Honest** — "board matches reality — nothing claimed beyond what the harness
     vouches for" / "Merged is confirmed by the facts" — *the auto-verifier (git & PR facts)*
   - ⚠️ **Not verified yet** — replaces "column ahead of reality" / "⚠ unverified"; the
     reason rewritten in words per status ("marked Committed, but the branch is not pushed
     to origin yet", "marked PR open, but no pull request has been found on GitHub yet",
     …) — *the auto-verifier*
   - 🆘 **Needs human** — the reason, *the policeman* / *the agent* / *you (operator)*, with
     an inline **✓ Resolve**
   - 🔧 **Manual** — "you are handling this card by hand — the policeman and the arch leave
     it alone" — *you (operator)*
4. **Links** — collapsed by default (`<details>`), a short brief while closed ("⎇ feat/csv
   (not on origin) · PR #9 · stale"), and when open a labeled list: Branch (with "not on
   origin" in words), Pull request (clickable, "merged as …"), Verified (state, when, by
   the auto-verifier), Pinged, Stale (with what it means), Blocked by / Prerequisites,
   Created by, From idea.

Rules: no raw reason strings on the card (the verifier's `warning` and the policeman's
`reason` are never rendered verbatim in the check — the check rewrites them; a
needs-human reason is the human-written reason and is shown as such with its raiser
named); every status carries its source; rarely-needed detail collapses.

Removed: the whole badge row and the detail's raw `⚠ <warning>` line, the duplicate
human/manual blocks in the detail (the Board check section carries them, with Resolve).
Kept: drag/drop, click-to-open, rename, delete, copy-ref, go-manual, the filter flags,
the column layout.

## Impact

- Client only: `cardSections.js` (+ test), `KanbanBoard.jsx` card body, `kanban.css`.
- Spec: `task-graph` (the card's sections and the source rule).
