## ADDED Requirements

### Requirement: The fleet peer API
Every harness SHALL expose, behind its normal password authentication, a peer API
for a fleet arch agent on another harness: a describe endpoint returning the peer
protocol version, the harness build version, the machine name, whether fleet sends
are accepted, whether the autopilot gate is open, and every registered repo with its
git identity (remote URL, branch, default branch, dirty) and availability; a send
endpoint that delivers a task into a repo agent's own conversation; and a transcript
endpoint returning the last N messages of a repo agent's conversation, refused for a
claimed repo. The peer API SHALL NOT be reachable through the arch agent's
per-process MCP token.

The receiving harness's OWN arch scope SHALL be authoritative for the fleet: the
describe SHALL report, per repo, whether that harness's arch agent manages it (and
the managed repo ids as a list), an unmanaged repo SHALL be reported with
availability `unmanaged`, and a send or transcript read for a repo outside that
scope SHALL be refused with status `unmanaged` naming the receiving harness's Arch
tab as the place to fix it.

#### Scenario: Describe reports the peer's repos and posture
- **WHEN** a fleet arch on harness A calls harness B's describe with B's credential
- **THEN** it receives B's protocol and build version, machine name, accept-sends and gate state, B's managed repo ids, and B's registered repos each with availability computed by B and whether B's arch manages it

#### Scenario: Send to a repo outside the peer's own scope
- **WHEN** harness B accepts fleet sends but its Operator has not put repo R in B's arch scope, and a peer send for R arrives
- **THEN** B returns `unmanaged`, says R must be scoped on B's Arch tab, emits no bubble, and runs nothing

### Requirement: The fleet send posture is visible before a send
The arch agent SHALL be able to see, before sending, whether a remote agent can be
sent to at all. `list_agents` SHALL carry, per agent, whether the owning machine's
own arch manages it (`managedThere`), `sendable`, and `blocked` (the reason when
not sendable). A `list_machines` tool SHALL return the fleet posture in one call:
this harness and every subscribed one with reachability, build version, this
Operator's allow-sends, the peer's accept-sends and gate state, the repos the peer's
arch manages, which of those are in this arch's scope, and which are sendable with
reasons for the rest. A remote send SHALL be refused locally, before any HTTP
request, with the same named status and reason when the peer is dark, has no peer
API, sends are not allowed, the peer does not accept, its gate is closed, or its
arch does not manage the repo. The Arch tab SHALL show the peer's own scope in the
picker (a repo outside it is named as such and cannot be scoped) and how many repos
each peer's arch manages.

#### Scenario: Blocked agent is reported, not sent to
- **WHEN** repo R on harness B is in A's fleet scope but B's arch does not manage R
- **THEN** A's `list_agents` shows R with `managedThere: false`, `sendable: false` and a `blocked` reason naming B's Arch tab; `send_task` to R returns `unmanaged` with that reason and makes no HTTP request

#### Scenario: Fleet posture in one call
- **WHEN** the arch agent calls `list_machines` with one subscribed harness B that manages two repos, one of which is in A's scope
- **THEN** the result lists self and B, B's reachability, version, allow-sends, accept-sends and gate state, both repos under `managedThere`, the scoped one under `inYourScope` and `sendable`

#### Scenario: Peer on a build that predates scope reporting
- **WHEN** B's describe answers without the `managed` field
- **THEN** A treats every repo on B as not sendable with a reason that says to upgrade B, and the Arch tab's picker says B's build does not report its scope

#### Scenario: Older peer has no peer API
- **WHEN** harness B runs a build without the peer API
- **THEN** A's describe attempt gets 404, A shows B as "no peer API on that build", and any send to B is refused locally with that status before any HTTP send

### Requirement: Accepting fleet sends is an operator opt-in on the receiving harness
A harness SHALL accept fleet sends only when its Operator has set "accept fleet
sends" (default off, persisted) AND its autopilot gate is open. A fleet send SHALL
pass the receiving harness's own deny list, availability rule and run slot exactly as
a local arch send does, and SHALL be refused with a named status (`not-accepting`,
`denied`, `claimed`, `busy`) otherwise. Nothing SHALL be queued.

#### Scenario: Not opted in
- **WHEN** harness B has not set accept fleet sends and receives a peer send
- **THEN** B returns `not-accepting`, emits no bubble, and runs nothing

#### Scenario: B's own fence applies
- **WHEN** B accepts fleet sends and receives a peer send whose text matches B's deny list
- **THEN** B returns `denied` naming the term and records the escalation in its own audit

## MODIFIED Requirements

### Requirement: Repo identity and send addressing are fleet-shaped
`list_agents` SHALL return, per managed agent, the machine (`self` for this harness,
else the collector source's label), the source id, repo id, name, git remote URL,
branch, availability, last actor, and running-since when busy. `send_task`,
`read_transcript` and `git_state` SHALL address a target by machine and repo id,
where machine is `self`, this harness's own label, a subscribed source's label
(case-insensitive) or its id. A remote target SHALL be reached through the fleet
client using the source's stored credential, only when the Operator marked that
source "allow sends"; the collector itself SHALL remain read-only. Remote git state
and availability SHALL be what the peer reported; a peer that did not answer SHALL
report availability `unreachable`.

#### Scenario: Agents listed across machines
- **WHEN** the arch agent calls `list_agents` with one local repo and one repo on a subscribed harness in scope
- **THEN** the local entry has `machine: "self"` and the remote entry has the source's label as `machine`, its source id, and the availability the peer computed

#### Scenario: Send to a remote machine
- **WHEN** `send_task` names a subscribed source whose "allow sends" is on and the peer accepts
- **THEN** the task lands in that repo agent's conversation on the peer, tagged `arch@<this machine>`, the tool returns `sent`, and the send is audited on both harnesses

#### Scenario: Send to a source without send permission
- **WHEN** `send_task` names a subscribed source whose "allow sends" is off
- **THEN** the tool returns an error naming the missing permission and no HTTP request is made

#### Scenario: Unknown machine is refused
- **WHEN** `send_task` names a machine that is neither self nor a subscribed source
- **THEN** the tool returns an error naming the unknown machine and nothing is sent

### Requirement: The arch loop wakes the arch agent from the event feed
The system SHALL provide an arch loop kind whose single instance is keyed to `@arch`
rather than a repo. On each engine tick it SHALL read the collector's event feed past
a persisted watermark, keep `turn.start` and `turn.ended` events whose source
identifies a managed agent — a managed local repo on the self source, or a managed
`(source, repo)` pair on a subscribed harness — and when any exist SHALL propose one
arch turn whose prompt describes them, naming the machine. It SHALL ignore
`chat.focus`. When nothing new exists it SHALL hold. On a missing watermark it SHALL
start from the collector's current last sequence and SHALL NOT replay history. It
SHALL publish an `arch.wake` event when it sends a wake prompt.

#### Scenario: Remote repo turn ends, arch agent wakes
- **WHEN** a managed repo on a subscribed harness publishes `turn.ended`, the collector ingests it, and the next tick runs
- **THEN** exactly one arch turn runs with a prompt naming that machine and repo, and the watermark advances past the event

#### Scenario: Unmanaged remote turns do not wake
- **WHEN** only events from repos on subscribed harnesses that are not in scope arrive since the watermark
- **THEN** the loop holds and the watermark still advances

### Requirement: Arch sends carry provenance into the repo agent's transcript
An arch send SHALL emit a user bubble in the target repo's dock conversation with
`actor: "arch"` for a local send and `actor: "arch@<machine>"` for a send received
from a fleet arch on another harness, run on the dock's existing session, and write
an audit line with kind `arch` on the harness that runs the turn. The bubble SHALL
appear exactly where a human message would, and the tag SHALL survive a reload from
the receiving harness's own audit.

#### Scenario: Fleet task visible in the receiving dock
- **WHEN** a fleet arch on harness A sends a task to a repo on harness B
- **THEN** B's dock shows a user bubble tagged `arch@A` with the task text, and the tag is still shown after a reload

### Requirement: The Arch tab is the arch agent's own surface
The web UI SHALL provide a top-level Arch tab, available in Advanced mode only,
showing the arch conversation, a managed-agents strip with each agent's machine,
availability, branch, last actor, elapsed time, and a control that opens the repo's
real dock for local agents, a scope picker grouped by machine (local repos and the
repos of each subscribed harness that allows sends, with that peer's status), the
loop header controls (arm, suggest/drive, cap, Stop), and a Fleet card showing this
harness's label, the "accept fleet sends" opt-in, and each subscribed source with
its peer status and "allow sends" state. Unmanaged agents SHALL be invisible to the
arch agent's tools.

#### Scenario: Scope spans two machines
- **WHEN** the Operator selects one local repo and one repo of a subscribed harness in the scope picker
- **THEN** the strip shows both with their machine chips, and `list_agents` returns exactly those two

#### Scenario: Peer without the API is explained
- **WHEN** a subscribed source runs a build without the peer API
- **THEN** the Fleet card shows it as "no peer API on that build" and its repos are not offered in the scope picker
