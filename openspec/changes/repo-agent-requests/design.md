# Design — repo-agent-requests

## D1 · Recording is inert

`request_arch` writes a row and returns. No run starts, no event is emitted to the arch, no
peer is called. The arch's slot (`RunSessionService`) is untouched by the tool; the only way a
request becomes an arch turn is the Operator's Approve. This is what "does NOT wake the arch"
means in code: the tool has no reference to the arch service at all.

## D2 · One store per harness, the hub pulls

The fleet channel is hub→peer (the hub holds each peer's credential; peers hold nothing for the
hub). So a request is recorded where the agent lives, and the hub PULLS it — the same shape the
hub file system uses. `AgentRequestStore` rows carry `SourceId`: null = recorded here, else the
collector source it was pulled from. The id is minted where the request was recorded and kept
on the pulled copy, so a decision names the same row on both machines.

Merge rule (`MergePulled`): a new id is inserted as pulled; an existing pulled row keeps a
decision made here; a pulled row still pending here takes the peer's decision when the peer has
one (its own Operator decided); a local row is never overwritten by a peer's view of it.

Decisions travel back (`DecisionsToPush` → `POST /api/arch/peer/requests/decision`), behind the
peer's accept-sends opt-in like every write a fleet arch may do there. A peer that refuses,
lacks the route (older build) or no longer has the row is settled too — nothing more to push.

## D3 · Scope: the hub's fleet scope decides whose requests it shows

The hub keeps pulled rows only from repos in its fleet scope (`IsManagedFleet`), because that is
what "its managing arch" means in this harness. A harness shows ALL rows recorded by its own
agents (there is one arch per harness; its own agents answer to it). A peer that is itself a hub
for its own agents shows them on its own tab; whichever Operator decides first stays (D2).

## D4 · Delivery = the goal-summary path

Approve calls `SendToArch(ReservedId, ComposeRequestMessage(row), ActorRequest)` immediately;
when the arch is mid-turn, the row stays approved-undelivered and `DeliverAgentRequests()` on
the engine tick posts it when the slot is free, one per tick — exactly how a finished goal's
summary reaches the Operator-facing conversation. `DeliveredAt` marks success; the tab shows
"waiting for the arch's slot" until then. The actor tag `request` keeps the transcript honest:
the bubble shows it was the harness relaying an approved agent request, not the Operator
typing, and `SendToArch` does not resume a stopped standing loop for it (only a human message
does).

The message names the agent and machine, the title, the text, and one sentence telling the
arch what this is and that it may answer the agent with `send_task`.

## D5 · Approve is gated like a send

`POST /api/arch/requests/{id}/approve` returns 403 with the gate closed, as `POST /api/arch/send`
does — it starts an arch turn. Reading and dismissing work with the gate closed; the tab says
why approving is refused.

## D6 · The tab reads one endpoint, pulls bounded

`GET /api/arch/requests` pulls peers first when the last pull is older than 10 s (the tab polls
every 5 s, skips hidden ticks), so an open tab costs one peer round per 10 s; the engine tick
pulls every 30 s with no tab open. One pull at a time (a try-lock); a concurrent reader gets
the last state.
