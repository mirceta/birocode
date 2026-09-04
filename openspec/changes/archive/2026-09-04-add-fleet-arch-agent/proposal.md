# add-fleet-arch-agent

## Why

The arch agent (`add-arch-agent`) coordinates the repo agents of ONE machine. The
Operator runs several machines, each with its own harness, and the harness already
has the fleet's eyes: the **collector** subscribes to other harnesses' event feeds
(read-only, watermark polling, persisted sources with encrypted credentials) and
the events app / status board show every machine's running agents. The arch agent
was deliberately built on the collector so that a fleet version would be "a change
of scope rather than a redesign" — its wake input is already source-tagged, its
agent identity already carries a machine and a remote URL, and `send_task` already
takes a `machine` argument that today refuses anything but `self`. What is missing
is the fleet's **hands**: no harness can send a task to a repo agent on another
harness, no remote send can carry honest provenance into the remote dock, and no
Operator can opt a harness in or out of being commanded. This change adds exactly
that, keeps the collector read-only by spec, and keeps the arch agent hosted in the
harness (the events app is a stateless observer and cannot host an agent; a
standalone fleet product would re-implement the CLI runner, sessions, autopilot
ladder, eval gate, auth and deploy for a two-machine fleet).

## What Changes

- **Modified: the arch agent sees the whole fleet** — the wake filter no longer
  restricts to the self source: managed scope becomes local repos plus
  `(source, repo)` pairs on subscribed harnesses; wake prompts and `list_agents`
  carry the machine. Remote availability comes from the peer, not from local git.
- **New: the fleet peer API** on every harness (`/api/arch/peer`) — the surface a
  fleet arch on another machine calls: describe (protocol version, build version,
  machine, whether sends are accepted, all registered repos with availability),
  send (a task into a repo agent's own conversation with actor `arch@<machine>`,
  subject to THIS harness's gate, deny list, claimed and busy rules), and transcript
  read. Behind the normal password auth; never behind the arch's per-process MCP token.
- **New: the outbound fleet client** beside the collector — reuses the collector's
  source addresses and stored credentials, but only for sources the Operator has
  marked **allow sends**. The collector itself stays strictly read-only.
- **New: two opt-ins, one per side** — the calling harness marks a source
  "allow sends"; the receiving harness sets "accept fleet sends" (default off) and
  keeps its autopilot gate as the host-only master switch.
- **Modified: provenance crosses the wire** — a remote send lands as a user bubble
  tagged `arch@<machine>` in the receiving dock, with an audit row written by the
  receiver, so the tag survives a reload without trusting the caller's word.
- **Modified: the Arch tab** shows machines: scope picker grouped by harness, agent
  rows with a machine chip, a Fleet card with both opt-ins and each peer's status
  (reachable / no peer API on that build / unauthorized / sends allowed).
- **New: `tests/loop-eval/fleet.mjs`** — the ship gate: two isolated harness
  instances on one box, one subscribed to the other with sends allowed, the arch on
  the first told to get the goal check green on the second's repo; asserts the
  remote turn, the `arch@` provenance on the receiver, the collector-carried
  `turn.ended` and the `arch.wake` that followed.

## Capabilities

### New Capabilities
- (none — the fleet is a scope change of `arch-agent`)

### Modified Capabilities
- `arch-agent`: fleet scope, peer API, outbound client, opt-ins, machine addressing,
  Arch tab fleet surface.
- `event-feed-collector`: per-source "allow sends" flag; the collector lends a
  source's address + credential to the fleet client without ever writing itself.
- `chat`: actor values of the form `arch@<machine>` render like `arch`.
- `loop-eval`: the `fleet` scenario.

## Impact

- **Backend**: `ArchAgentService` (fleet scope, machine resolution, peer-side
  send/agents/transcript), new `FleetClient`, new `ArchPeerController`,
  `CollectorService` (allow-sends flag, peer request factory), `ArchStateStore`
  (managed fleet, accept flag), `MessageActors` (fleet actor), `ArchController`
  (fleet state/scope/opt-in), `CollectorController` (sends flag).
- **Frontend**: `Arch.jsx` (machines), `MessageBubble.jsx` (`arch@x` class),
  events-app (sends toggle per source).
- **Tests**: unit tests on wake composition across sources, machine resolution,
  fleet actor annotation; `tests/loop-eval/fleet.mjs`.
- **Docs**: `docs/event-feed-contract.md` gains the peer API section;
  `understanding-app/` rolling.
- **Upgrade**: both harnesses must run this build for a fleet send; an older peer
  answers the describe with 404 and is shown as "no peer API on that build" — the
  fleet arch can see the mismatch before the Operator upgrades it by hand.
