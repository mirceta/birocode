# Policeman: a "Responsibilities" view — the rules, situation by situation

## Why

Operator, 2026-09-19: "the policeman kind of feels like a black box. We don't know what it's
supposed to do, what it does." The Policeman tab has *What it is* (the one loop, the seven
steps, what it writes, what it never does) and *How it works* (the four cytoscape pictures), but
nowhere says, for a given card in a given state with a given ending of its conversation, **what
the policeman does** — and that is the question an Operator has when a card is flagged, moved,
or left alone.

## What changes

A new Policeman view, **📋 Responsibilities**, between *What it is* and *How it works*: one table
in the order the pass runs (which cards · trace · facts and move · judge · read · flag · clearing
and answering), four columns per row —

| the card | the conversation says · the facts show | the policeman does | you see · what happens next |
|---|---|---|---|

— plus the reading vocabulary (the eight states, from the same `OBSERVATIONS` the card uses) and
a filter box. Every row names the code it is read from (`PolicemanSweep.ReasonFor`,
`BoardIntegrity.StuckReason`, `Handoffs.FollowUpFor`, …); the numbers (every 60 s, 2 h attention
window, 2 sweeps, 5 min trace cadence, 8 questions per pass, 2 h look-back, 3 shared words) are
the code's constants, restated in one `RULES` object.

The data is a pure module (`policemanDuties.js`), node-tested: every row complete,
every reading state covered in the Read group, every attention state covered in the Flag group,
the numbers pinned, the filter narrowing by every term. The view (`PolicemanResponsibilities.jsx`)
only renders it, so the explanation cannot drift from the product without a test noticing.

## Where it lands

PR #122 (`feat/policeman-handoff-detection`), because the table describes the handoff ending
that only exists there; the branch was first brought up to date with `main` (the bundle rebuilt).

## Not in scope

Changing any rule. If a row reads wrong to the Operator, the code is wrong or the row is — both
are fixed by a change of their own.
