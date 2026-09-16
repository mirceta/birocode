# Design — Kanban external owner

## D1. Two related states, one skip rule

`Node.Manual` (openspec kanban-board-integrity) and the new `Node.ExternalOwner` are kept as
**separate fields** because they mean different things — manual is the Operator's own card
driven by hand (our domain), external is another human's card (not our domain) — and the
Operator may set both (a card they used to drive by hand, now handed over). What they share
is the consequence: nothing automatic touches the card. That consequence lives in exactly one
place, `CardDomain`:

| helper | answers |
|---|---|
| `IsExternal(n)` | `ExternalOwner` is non-blank |
| `IsHandsOff(n)` | manual **or** external — what `awaitingDispatch` and every skip check |
| `HandsOffStatus(n)` | `external` \| `manual` \| null — **external wins** when both are set |
| `HandsOffReason(n)` | the one-line reason: "owned by <name> (external) — out of our domain, not ours to judge" / "manual — the Operator handles it directly" |
| `Refusal(n, consequence)` | `(status, message)` every tool answers, or null when the card is ours |

The arch's `update_task` / `dispatch_task` and the policeman's `flag_needs_human` /
`observe_card` / `sync_card` all go through `Refusal`, so manual and external refusals read
alike and a third state later is one more branch, not five more `if`s.

## D2. The judge

`BoardIntegrity.Judge` checks external **first** (before manual): an external card is
`external` whatever its column, verified state or silence say — so it is never dishonest,
never stuck, never stamped. `Summary` gains a trailing `External = 0` so older constructors
still compile; `Summarize` counts it; `Apply` needs no change — an external card is not
`Stuck`, so the existing branch withdraws a policeman stamp it may still carry.

## D3. Handing over withdraws the policeman's own marks

`SetExternalOwner(id, name, now)`: trims and caps the name (`CardDomain.MaxOwner` = 120), a
blank clears. Setting a name drops a `NeedsHuman` stamped by the **policeman** and an
`Observation` by the **policeman** — its verdict and its reading were about a card that is no
longer ours to judge. An agent's or the Operator's stamp is left alone (the Operator resolves
those). Clearing changes nothing else: the next pass judges the card again. An unchanged name
is a no-op (no `UpdatedAt` stamp, no sync churn). The field rides the node's per-id LWW sync
like `Manual`; an older peer that does not know the field drops it when it rewrites the node,
the same limitation manual has today.

## D4. The verifier

`BoardVerifier.VerifyOnce` `continue`s on an external card right after the manual check, with
the note "<title>: external — owned by <name>, not verified". A claim badge (`Warning`) the
card carried **before** the handover stays as it was — the pass neither probes nor re-badges
it, exactly as with manual; the card's Board check shows "External owner" regardless.

## D5. The arch and the policeman

- `list_tasks`: `externalOwner`, `externalOwnerAt`; `awaitingDispatch` is false for any
  hands-off card (node-level and per-assignee).
- `board_integrity`: the `external` count, and `externalOwner` on each needs-human row.
- The policeman prompt: step 1 names "manual or externally owned (not yours)", step 2 reads
  only cards that are "neither manual nor externally owned", step 4 says to leave externally
  owned cards entirely alone (never read, observe, move, flag or report them), step 6's verdict
  line adds "· N external"; the handover summary counts them.
- The arch role prompt: a paragraph distinguishing `externalOwner` from `manual` and listing
  what it must never do (dispatch, update, move, verify, judge, report as stuck/dishonest/
  needing a human); tool descriptions say `update_task` / `dispatch_task` / `observe_card` /
  `sync_card` / `flag_needs_human` refuse with status `external`.

## D6. API

`POST /api/taskgraph/nodes/{id}/owner { name }` (400 on a blank name; accepts the card ref
like every node route) and `DELETE /api/taskgraph/nodes/{id}/owner`, mirroring the human and
observation sub-resources rather than riding the node PATCH — a string that must distinguish
"absent" from "clear" is clearer as its own resource.

## D7. UI

- `ownerOf(node)` in `cardSections.js` → `{ key: 'external', icon: '👤', name, word: "<name>
  (external)", text, source: 'operator', at }` or null; `boardCheckOf` returns
  `{ key: 'external', word: 'External owner', text: "<name> owns this card — not ours to
  judge; nothing automatic touches it" }` before every other status.
- The card: an **Owner** section between Board check and Agent (only when set) with "↩ Ours
  again" inline; `kb__card--external` = violet dotted left edge (manual = dashed grey);
  `kb__check--external` violet; Ping disabled with the reason in its tooltip.
- The detail: "Owner: 👤 <name> (external) — out of our domain …" + "↩ Ours again", or a
  name field + "👤 External owner" (Enter submits).
- Filters: an `external` flag ("external owner") beside `manual`.
- The policeman line and the Policeman panel's verdict add "· N external"; the explainer's
  Board-check diagram gains the state with two Operator-only transitions, the drive machine's
  "Not mine" names it, and the state machine (and its vendored copy in the understanding app)
  says "manual · external owner · delivered → leave alone".
