# Design — add-fleet-arch-agent

## Context

`add-arch-agent` shipped one arch agent per harness: wake from the collector feed,
tools over the harness's own MCP endpoint, sends through the per-repo run slot with
actor `arch`, a structural tool fence, a home repo. Its read half is fleet-shaped by
design (source-tagged events, `AgentView.Machine` + `RemoteUrl`, a `machine` argument
on `send_task`); its write half is in-process only. The collector (`event-feed-
collector`) owns the fleet roster — persisted sources with encrypted credentials —
and is spec'd strictly read-only toward watched harnesses. The Operator decided
(2026-09-02): the arch agent stays hosted in the harness and any harness can be the
hub; peers are upgraded by hand for now; the goal is a real cross-machine test with
this machine's harness and a freshly deployed one.

## Goals / Non-Goals

**Goals:**
- A fleet arch on harness A can list, read and send to repo agents on harness B
  through B's own rules (gate, deny list, claimed, busy), with honest provenance in
  B's dock and B's audit.
- Zero new transport for observation: wakes still come from the collector.
- Two explicit opt-ins (A: allow sends per source; B: accept fleet sends).
- Old peers degrade visibly (protocol/version in the describe), not silently.
- A ship gate that runs the whole path on one box with two isolated instances.

**Non-Goals:**
- Arch-to-arch delegation (`machine/@arch` addressing); the fleet arch talks to
  repo agents directly.
- Scoped send tokens; the feed credential (the peer's password) is the credential.
- Push transports, discovery, or any write through the collector.
- Orchestrated upgrades of peers (future; the describe's `version` is the hook).

## Decisions

**D1 — The arch agent stays in the harness; the collector stays read-only; a
sibling client sends.** `FleetClient` lives beside `CollectorService`, asks it for
an authenticated `HttpRequestMessage` toward a source (`BuildPeerRequest`), and is
the only thing that ever POSTs to a peer. The collector spec's "only GET" invariant
is preserved on the collector; the send permission is a flag on the source
(`allowSends`, default false, persisted, shown in the events app and the Arch tab).
*Rejected:* hosting the agent in the events app (a static page cannot hold a
session, a credential or a watermark and dies with the tab) or as a standalone
product (re-implements runner/sessions/loops/eval/auth/deploy for two machines).

**D2 — Receiving side is a small peer API, not an actor field on `POST /api/chat`.**
`GET /api/arch/peer` (describe: `protocol`, `version`, `machine`, `acceptsSends`,
`gateOpen`, `repos[]` with availability), `POST /api/arch/peer/send`
(`{ repoId, text, branch?, from }`), `GET /api/arch/peer/transcript`. The receiver
computes the actor as `arch@<from>` itself and writes its own audit row (kind
`arch`, phase `fleet:<from>`), so nobody can post a bubble that claims to be human,
and the tag survives a reload from the receiver's own audit. All three are behind
the normal password middleware — the stored feed credential is exactly what
authorizes them. *Rejected:* a general `actor` on the chat POST — any caller with
the password could then tag anything as anything.

**D3 — Managed scope = local repo ids + fleet keys.** `arch.json` gains
`managedFleet: ["<sourceId>/<repoId>", …]` and `acceptFleetSends`. Wake
composition keys events as bare `repoId` for the self source and
`<sourceId>/<repoId>` for remote ones, and keeps any key in the managed union; the
prompt line names the machine. The self-only filter is removed — that one line was
the designed scope change.

**D4 — Machine addressing by collector label.** `list_agents` returns `machine`
(`self` for local, else the source label) and `sourceId`; `send_task`,
`read_transcript` and `git_state` accept `machine` as `self`, the self label, a
source label (case-insensitive) or a source id. Remote git state is what the peer
reported (no remote git calls); availability adds one value for remote agents only,
`unreachable`, when the peer did not answer.

**D5 — Both sides apply their own fence.** A fleet send passes A's checks (loop
armed, managed, source allows sends, A's deny list) and then B's (accept flag,
autopilot gate, B's deny list, claimed, busy). Outcomes are the same vocabulary as
local sends plus `unreachable`, `unauthorized`, `not-accepting`, `no-peer-api`.
Busy is still not a queue: B's `turn.ended` reaches A through the collector and
wakes the arch.

**D6 — Peer views are cached, refreshed on demand.** `FleetClient` keeps one
snapshot per source (describe result + timestamp). Tool calls and the Arch tab
refresh when older than 5 s (blocking, bounded by the 6 s HTTP timeout); wake
composition uses the cache only, never blocking the engine tick on a dead peer.

**D8 — The peer's own arch scope is authoritative; posture is visible before a
send.** (Added 2026-09-03 after the first real two-machine run: A's arch sent a
task to a repo on B that B's own arch did not manage, and had no tool to know.)
D2's "the remote arch's scope decides" is reversed: B's describe reports `managed`
per repo and `managedRepoIds`; an unmanaged repo is `unmanaged` to the fleet, and
B refuses a peer send or transcript read for it with `unmanaged` naming B's Arch
tab. On A, `FleetSendPosture` (pure) turns the snapshot into a `SendBlock`
(status + reason) — peer dark / no peer API / sends not allowed / not accepting /
gate closed / not managed there — checked in `send_task` before any HTTP,
surfaced per agent in `list_agents` (`managedThere`, `sendable`, `blocked`) and
in one call by the new `list_machines` tool. The Arch tab's picker shows a
peer's repo outside its own scope as "not in <peer>'s arch scope" (disabled), and
the Fleet card says how many repos each peer's arch manages. A peer that omits
`managed` (older build) is not sendable with an "upgrade it" reason. The role
prompt (v3) says: never guess a repoId, and when `blocked` names a reason, report
it — every cause is a person's setting on one side or the other.

**D7 — Ship gate is `tests/loop-eval/fleet.mjs`, isolated only for now.** Two
instances from the same bin copy, separate ports and data dirs; B registered as a
source in A with B's password and `allowSends`; B's `acceptFleetSends` set through
its API; A's arch armed in drive mode and told to get B's repo green. Live mode is
the Operator's real two-machine run after deploying to the second box.

## Risks / Trade-offs

- [Credential blast radius] the feed credential is the peer's full password; it
  already sat in the collector. `allowSends` is the per-source consent, and
  `acceptFleetSends` + the host-only gate are the receiver's. A scoped token is
  future work.
- [Peer on an older build] describe returns 404 → status `no-peer-api`; the Arch tab
  says so; sends are refused locally before any HTTP.
- [Dead peer blocks a tool call] bounded by the HTTP timeout; wake composition never
  blocks (D6).
- [Feed durability] unchanged: the feed is a wake signal, `read_transcript` and the
  peer describe are the source of truth.

## Migration Plan

Additive. `arch.json` gains two fields with defaults; `collector-sources.json`
gains `AllowSends` (absent = false). Both harnesses must run this build for a fleet
send; nothing changes for a harness that never opts in.
