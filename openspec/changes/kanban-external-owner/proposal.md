# Kanban: a card owned by ANOTHER human developer — out of our domain, the arch and the policeman leave it alone

## Why

The fleet board mixes our work with cards that are really somebody else's: a developer
outside our authority owns them — not the Operator, not the arch, not a repo agent. Today
there is no way to say so. The verifier keeps probing such a card, the policeman calls it
"dishonest" or "stuck" or stamps it 🆘, the arch lists it as awaiting dispatch and would
happily update it, and at a glance nothing on the card says "this is not ours to judge".

The existing **manual** flag (openspec kanban-board-integrity) is close but different: manual
means *the Operator handles it by hand, directly with the repo agent* — still our domain,
still our card, only driven without the arch. What is missing is a state that says *a
different human owns this entirely and we have no authority over it*.

## What changes

1. **A per-card external owner.** `ExternalOwner` (free-text name) + `ExternalOwnerAt` on
   the node, persisted with the card and synced with the board like every node field.
   `POST /api/taskgraph/nodes/{id}/owner { name }` sets it (blank refused),
   `DELETE …/owner` clears it. Handing a card over withdraws the policeman's OWN marks (its
   🆘 stamp, its observation) — it is no longer ours to judge; an agent's or the Operator's
   stamp stays.

2. **One shared "whose card" rule.** `CardDomain` is the single place every automatic actor
   asks before touching a card: `IsExternal`, `IsHandsOff` (manual OR external),
   `HandsOffStatus` (external wins when both are set), `HandsOffReason`, and `Refusal(node,
   consequence)` → `(status, message)`. Manual and external are modelled as related but
   separate card states that share this skip logic — nothing is forked.

3. **Out of our domain while set.**
   - The **verifier** does not probe, advance or badge it (note: "external — owned by
     <name>, not verified").
   - The **policeman** judges it **external** — never dishonest, never stuck, never stamped;
     its counts gain `external`; `board_integrity` reports the count; `flag_needs_human`,
     `observe_card` and `sync_card` refuse it with status `external`; its prompt tells it to
     leave externally owned cards entirely alone (not read, not observed, not moved, not
     flagged); its verdict line and handover count them.
   - The **arch** never sees it as `awaitingDispatch`; `dispatch_task` and `update_task`
     refuse it with status `external`; `list_tasks` carries `externalOwner` /
     `externalOwnerAt`; its role prompt explains the difference from manual.

4. **Visibly someone else's.** The card gets an **Owner** section (composing with the
   card-sections redesign: "OWNER 👤 <name> (external) — out of our domain — set by you, N
   ago · ↩ Ours again"), its Board check reads "👤 External owner — <name> owns this card —
   not ours to judge" (external wins over manual / needs human / not verified), a violet
   dotted card edge distinct from manual's dashed grey, Ping disabled, an `external owner`
   filter flag, and the policeman line counts "· N external". The detail offers "👤 External
   owner" with a name field and "↩ Ours again". The policeman explainer's Board-check
   diagram, drive table, pass and can/cannot lists, and the understanding app's state
   machine name the state.

## Composition with the in-flight card work

- **kanban-card-sections** (PR #103): the Owner section is one more labeled section in the
  same model (`ownerOf` beside `boardCheckOf` / `observationOf` in `cardSections.js`); the
  Board check gains one status key, `external`, with the same source-and-time phrasing.
- **policeman-syncs-cards / policeman-observes-agents** (PR #107): `sync_card` and
  `observe_card` refuse external cards through the same `CardDomain.Refusal` as manual; the
  policeman's prompt step 2 ("read every agent") excludes them; the explainer and the
  state machine (and its vendored copy in the understanding app) gain the state.

This change is branched from origin/main with those two branches merged in, so it
extends their card-state model and UI rather than forking a parallel scheme. Merge #103
and #107 first (or merge this one after them) — the diff then shrinks to this change.

## Impact

- Backend: `TaskGraphService` (`ExternalOwner`/`ExternalOwnerAt`, `SetExternalOwner`),
  new `CardDomain`, `BoardIntegrity` (state `external`, `Summary.External`),
  `BoardVerifier` (skip), `TaskGraphController` (owner endpoints), `ArchAgentService`
  (`list_tasks`, refusals, role prompt), `ArchAgentService.Policeman` (tool refusals,
  counts), `ArchPoliceman` (prompt, handover), `ArchMcpServer` (tool descriptions).
- Client: `cardSections.js` (`ownerOf`, external Board check), `taskFilters.js`
  (`external` flag), `KanbanBoard.jsx` (Owner section, detail control, Ping, policeman
  line), `kanban.css`, `PolicemanPanel.jsx`, `policemanDiagram.js`,
  `policemanStateMachine.js` (+ the understanding app's vendored copy); the Management App
  bundle (`events-app/manage`) rebuilt.
- Tests: `ExternalOwnerTests` (backend), `cardSections.owner.test.mjs` + filter / diagram
  tests (client), `shot-kanban-external-owner.mjs` (headless evidence),
  `check-external-owner-api.mjs` on an isolated instance.
- Specs: `task-graph` (the owner, the skip, the UI), `arch-agent` (the arch and the
  policeman respect it).

## Out of scope (follow-ups)

- A picker fed by a real source of people (GitHub collaborators, a fleet-wide roster) —
  free text is the natural first source; the endpoint takes a name either way.
- Notifying the external owner, or reading their PRs on their behalf.
