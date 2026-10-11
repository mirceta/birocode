# Proposal: remote-fleet-agents — the sofa remote sees and drives the whole fleet

Part of the Sofa Mode effort (fleet card `68090860b8684594a52c0b254f80c217`). Operator's ask,
2026-10-10: *"The living room remote can now access agents on this computer. But as I am looking
on the remote myself — I see only the local agents, and not the fleet computer agents. Can we add
the ability to see the fleet computer agents too?"* Size M, agreed with the Operator the same day;
the arch runs the end-to-end as a goal conversation (`goal-plan.md`): build here on
`feat/remote-fleet-agents`, the hub agent pulls the branch and tests it, the PR comes only when it
works. **No intermediate PRs** — the Operator's explicit process steer.

## Why

The topology changed under sofa mode. The living-room machine (DESKTOP-F9OH7AP) became a fleet
computer controlled by the hub (DESKTOP-POAPPP3); the phone now pairs with the **hub**, and the
living-room projector shows the hub's harness. The `/remote` page lists the agents of the harness
the phone is paired with — `GET /api/dock` of that harness — so the Operator sees the hub's agents
and nothing of the fleet, although the hub already knows every peer's agents (`GET
/api/arch/fleet/status`, the Fleet tab) and already holds a credential for each peer (the
collector's source credential, which the fleet client sends as `X-Auth-Password`).

What is missing is three hops the harness does not make today:

- **The list.** The remote reads one dock. The fleet status has every machine's agents, with
  availability and the unseen-result latch — the badges the remote already shows.
- **The write.** The phone is paired with the hub only (one PIN, one session cookie, one origin).
  A peer's agent can be written to only by a request to the peer's own API with the peer's
  password. The phone must never hold that password and must not pair with every machine.
- **The screen.** Opening a peer's agent on the projector means the projector browser must
  show the **peer's** harness — a different origin where that browser has no session. The
  Operator's words: *"all we need is that fleet computer's harness password"* — and the hub has
  it. So the hub can mint a one-shot pairing PIN on the peer and send the projector to the
  peer's `/remote?pin=…&then=…`, which logs the big screen in there exactly as a phone pairs.

## What

- **A relay on the paired harness** — `/api/remote/relay/<sourceId>/<route>` — forwarding an
  allow-listed handful of calls to the peer's own API with the credential the collector stores:
  the peer's dock, a session's messages and tools, its screens, its remote commands, a pairing
  PIN, a chat send, a stop. Nothing else is proxied. The two calls that make a peer's agent *do*
  something (send, stop) are gated by the hub's existing per-source "allow sends" switch.
- **The remote lists the fleet**, grouped by machine: this harness's dock first, then each peer's
  docked agents from the fleet status; a dark machine stays listed, greyed. Tapping a peer agent
  writes, peeks, answers and stops through the relay.
- **The projector follows**: `open-agent {sourceId, repoId}` for a peer becomes a `navigate` to
  the peer's `/remote?pin=<one-shot>&then=/studio?agent=…&screen=<name>`; the peer's `/remote`
  redeems the PIN and continues. The phone remembers where the screen is and the hub enqueues
  every later command where the screen listens (relaying it to the peer); opening a hub agent, or
  any view, brings the screen home. A peer whose credential the hub lacks gets the plain studio
  URL — its login page, and the phone says so.

## Out of scope

- Pairing the phone with peers, or any credential on the phone. The phone talks to the hub only.
- The living-room host (`LivingRoom.App`): it embeds whatever the big screen shows; a navigate
  is a page load like any other. Haydar (the daljinski remote) talks to the hub only — unchanged.
- Local apps of a peer's repo on the Apps row (`/api/repos` is the hub's) — hidden for peers.
- Live typing, push, a PWA — as before (sofa-mode).
