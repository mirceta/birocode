# Design — Kanban card sections

## D1. One pure module decides, the board only renders

`cardSections.js` exports `progressOf(node)`, `progressNote(node, {blockedBy, now})`,
`boardCheckOf(node, {integrity, checkedAt})` and `linksOf(node, {prereqs, blockedBy, stale,
now, ideaNumber})`. Each returns plain data (labels, words, tones, sources, timestamps);
`KanbanBoard.jsx` maps them to markup. Everything is unit-tested without a DOM.

## D2. Board check precedence

`manual` → `needs-human` → `unverified` → `honest`. Manual wins because nothing on a manual
card is policed; a human request outranks a verification gap because it is the thing the
Operator must act on; "not verified yet" is the verifier's `IsUnverified` rule
(`status > max(doing, verifiedStatus)`) OR a `warning` OR a policeman verdict of
`dishonest`; everything else is honest.

Sources: `auto-verifier` (git & PR facts, the harness's own verification), `policeman`,
`agent`, `operator`. The check's "by" line always renders `sourceLabel` and the time when
known (`verifiedAt`, `needsHuman.at`, `manualAt`, else the verdict's `checkedAt`).

## D3. Plain reasons, never raw strings

`plainUnverifiedReason(node)` rewrites per status: committed (+ `pushed === false` →
"not pushed to origin yet"), pr-opened, pr-merged, done (merge not live vs not confirmed),
generic. The verifier's `warning` text ("claimed pr-merged, verified: doing — branch not on
origin") and the policeman's `reason` ("column ahead of reality — …") are never shown on
the card; they remain in the API for the arch and the policeman. A needs-human reason is a
sentence written for a human by whoever raised it, so it is shown verbatim with the raiser.

## D4. Progress

Six steps from `kanbanColumns.STEPS`; states done / current / current-unverified / todo;
the current step is amber when the card is ahead of the facts so the Progress row and the
Board check agree. The note under the steps replaces five former chips (blocked, pinged,
awaiting ping, label only, not assigned).

## D5. Links

A `<details>` with a brief summary while collapsed (branch, PR, stale, blocked — the
things that matter at a glance) and a labeled `<dl>` when open. Clicks inside it stop
propagation so toggling it never opens/closes the card's detail panel; the native
summary toggle still works.

## D6. What moved where

| before | now |
|---|---|
| 🆘 chip + detail block with Resolved | Board check 🆘 Needs human, ✓ Resolve inline |
| ✋ manual chip + detail line | Board check 🔧 Manual (the ✋ toggle stays in the header; Go manual / Back to auto in the detail actions) |
| 👮 column ahead of reality, ⚠ unverified, detail `⚠ <warning>` | Board check ⚠️ Not verified yet with a plain reason |
| ⛔ blocked, 📣 pinged, ⏳ awaiting ping, 📎 label only | the Progress note |
| ⎇ branch, PR, ⏱ stale, ✓ prereq, 🏛 created by, 💡 idea | Links |

## D7. Tests

`cardSections.test.mjs`: steps and states, the notes, check precedence and sources, the
rewritten reasons (and that the raw strings never appear), links content and summary.
Evidence: `shot-kanban-card-sections.mjs` renders one card per check state and asserts no
card shows "column ahead of reality" or a bare "unverified" badge, every check names a
source, Resolve works inline, drag data still set.
