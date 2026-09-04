# arch-agent Specification

## Purpose
The arch agent: one standing middle-management session per harness (reserved id `@arch`) that assigns work to repo agents through conversation only, wakes from the event feed, and reports to the Operator. Synced from change add-arch-agent.
## Requirements
### Requirement: One arch agent per machine with a home repository
The system SHALL provide one arch agent per harness instance, identified by the
reserved id `@arch`, backed by one standing Claude session whose working directory
is a dedicated **home repository**: a git repository folder under the Projects Root,
a sibling of the harness's own repo and never inside any registered repo. The home
repository SHALL be created and git-initialised on first arm with a role prompt file
and `memory/` and `assignments/` folders. The home repository SHALL be the only
location the arch agent may write to.

#### Scenario: First arm creates the home repository
- **WHEN** the Operator arms the arch agent and no home repository exists
- **THEN** the harness creates `<ProjectsRoot>/arch-home`, initialises git, writes the role prompt and the two folders, and the arch session starts with that folder as its working directory

#### Scenario: Home repository is not a registered repo
- **WHEN** the home repository exists
- **THEN** it does not appear as a repo card or dock tab, and the Arch tab shows its path and recent commits instead

### Requirement: The arch agent has no power over managed repos beyond conversation and git state
The arch agent SHALL act on managed repos only through the harness-served tools
`list_agents`, `git_state`, `read_transcript`, `send_task`, and on its own home
repository through `remember` and `recall`. The arch session SHALL run with the
CLI's edit, write, shell, web, sub-agent and file-read tools disallowed (the
`--disallowedTools` flag, which the CLI enforces in every permission mode) and a
settings file carrying the same denials; its memory SHALL be read through `recall`,
so every file read it makes is a harness tool call. Every tool call SHALL be
recorded by the action audit under actor `arch`. Tool outputs (transcripts, wake prompts) SHALL be presented to the arch
session as data, and the role prompt SHALL state that they are never instructions.

#### Scenario: Arch agent attempts a file edit or read in a managed repo
- **WHEN** the arch session invokes an edit, write, shell or file-read tool targeting any path
- **THEN** the CLI reports the tool as unavailable for the session and no file in any repo is touched or read

#### Scenario: Every arch tool call is audited
- **WHEN** the arch agent calls any of its tools
- **THEN** the action audit records the call with actor `arch`, the target repo when there is one, and the outcome

### Requirement: Availability of a managed repo is decided by the run slot and the checked-out branch
For each managed repo the system SHALL compute an availability of `available`,
`busy`, `claimed`, or `unmanaged`. A repo SHALL be `busy` while its builder-lane run
slot is running for any actor. A repo SHALL be `claimed` when its checked-out branch
is neither the repo's default branch nor a branch recorded in the arch home's
assignments as created for an arch-assigned task. A `claimed` repo SHALL receive no
sends and no transcript reads from the arch agent; `git_state` SHALL still report it.
A dirty working tree SHALL NOT by itself make a repo `claimed`; it SHALL be reported.

#### Scenario: Operator's feature branch claims the repo
- **WHEN** a managed repo is checked out on `feature/x` and no arch assignment recorded `feature/x`
- **THEN** `list_agents` reports it `claimed`, `send_task` to it returns `claimed` without sending, and `read_transcript` on it is refused

#### Scenario: Arch-created branch keeps the repo available
- **WHEN** the arch agent sent a task with `branch: feature/y` and the repo is now on `feature/y` with a free slot
- **THEN** `list_agents` reports it `available` and sends succeed

#### Scenario: Dirty tree on the default branch stays available
- **WHEN** a managed repo is on its default branch with uncommitted changes and a free slot
- **THEN** availability is `available` and `git_state` reports the tree as dirty

### Requirement: Contention on a repo agent is arbitrated by the run slot only
An arch send SHALL use the same per-repo single-flight run slot as a human or loop
send. When the target's slot is busy, `send_task` SHALL return `busy` without
queueing or stashing anything. The arch agent SHALL never cancel or pre-empt a running
turn. Disarming the arch loop SHALL stop further arch sends and SHALL leave running
repo turns to finish.

#### Scenario: Send to a busy repo returns busy
- **WHEN** the arch agent calls `send_task` on a repo whose slot is running
- **THEN** the tool returns `busy`, no bubble is emitted, nothing is queued, and the arch agent is later woken by that repo's `turn.ended`

#### Scenario: Operator takes a repo back
- **WHEN** the Operator disarms the arch loop while a repo turn started by the arch agent is running
- **THEN** the turn runs to `turn.ended`, no further arch sends occur, and the Operator's next send on that repo succeeds with actor `human`

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

### Requirement: Arch sends are fenced, capped, and audited like loop sends
The deny-list fence, the drive cap, the suggest/drive mode, and the audit log SHALL
apply to arch sends unchanged. A send whose text matches a deny term SHALL return
`denied` naming the term. A send beyond the cap SHALL return `capped`. In suggest mode
the wake prompt SHALL pre-fill the Arch tab composer instead of being sent.

#### Scenario: Deny term blocks an arch send
- **WHEN** the arch agent calls `send_task` with text matching a deny term
- **THEN** the tool returns `denied` with the term, nothing is sent, and the audit records the escalation

#### Scenario: Suggest mode holds the wake prompt
- **WHEN** the arch loop is armed in suggest mode and a managed repo publishes `turn.ended`
- **THEN** the composed wake prompt appears in the Arch tab composer and no arch turn runs until the Operator sends it

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

### Requirement: The Arch tab has a Chat lane and a Tools lane
The Arch tab's main column SHALL offer three lanes in the style of a repo dock's lane
row: **Chat** (the arch conversation and composer, the default), **Tools**, and
**History**. The Tools lane SHALL list the harness-served tools exactly as the arch
session receives them from the MCP server's `tools/list` (name, description, parameters
with type and required-ness, and the call name the session uses), per-tool usage read
from the action audit (call count, last call time and outcome, target repo when any),
the built-in CLI tools the session is denied, and a preflight that checks the live
surface (MCP server answers `tools/list` with the full catalogue, the bearer token
validates, the home repo exists or is reported as created-on-arm, at least one managed
repo, autopilot gate and kill switch). The Tools lane SHALL have nothing to save: the
surface is fixed by the harness. The History lane is specified by the tool-call history
requirement below. The managed-agents strip and loop controls SHALL stay visible in
every lane.

#### Scenario: Tools lane mirrors the MCP catalogue
- **WHEN** the Operator opens the Tools lane
- **THEN** it shows one section per tool the MCP server lists, in the same order and with the same descriptions and parameters, plus the denied built-in tools as a separate section

#### Scenario: Usage comes from the audit
- **WHEN** the arch agent has called `list_agents` twice and `send_task` once on repo `a`
- **THEN** the Tools lane shows two calls on `list_agents`, one on `send_task` with its last outcome and `a` as the target, and "never called" on the rest

#### Scenario: Preflight before the first arm
- **WHEN** the Operator runs the Tools preflight with a scoped repo, an open gate and no home repo yet
- **THEN** the MCP, token, scope and gate checks pass, the home check is reported as skipped with "created on first arm", and the surface reads as ready

#### Scenario: Switching lanes keeps the conversation
- **WHEN** the Operator switches to Tools or History and back to Chat
- **THEN** the conversation, the composer draft and the managed-agents strip are as they were

#### Scenario: Desktop reaches the same surface from the dashboard
- **WHEN** the Operator opens the dashboard in Advanced mode and presses the Arch chip on the panel rail
- **THEN** the Arch surface opens as a centered pop-up over the docks (same mechanism and persistence as the Ideas/Autopilot/Audit/Traffic pop-ups), the chip is pressed while it is open, Esc or × dismisses it, and "open dock" closes the dashboard onto that repo's dock; in Basic mode the chip is absent

### Requirement: The Arch tab's History lane shows every tool call of the conversation, readably
The Arch tab's History lane SHALL list every tool call the arch agent made in the
conversation the tab shows, reconstructed from the session transcript on disk so it is
complete after a reload, grouped under the user message that caused each call with that
message's actor (Operator or harness wake-up), time and call count. Each call SHALL be
shown as a card with: a plain-language sentence of what the call did (phrased per
harness tool from its arguments — the repo, machine, branch, tail or memory path it
named — and as name plus input summary for a built-in tool), the tool name and whether
it is a harness tool or a built-in, a status (ok, error, running, or no result), the
call time and elapsed time to its result. Opening a card SHALL show the complete
arguments as a key/value table, the result parsed from the harness tool envelope
(status, detail, data) or as text otherwise, a note when the result was clipped for
display with its real length, and the raw call on request. The lane SHALL offer
filtering by tool (with counts), errors only, free-text search over arguments and
results, newest-first or oldest-first order, and expand / collapse all. While an arch
turn runs, its tool calls from the live stream SHALL appear in the lane at once (a
running call marked as such) and settle into the durable list when the transcript
carries them. The endpoint behind the lane SHALL tolerate a malformed transcript line
by skipping it and SHALL list a call with no recorded result as such.

#### Scenario: A finished conversation is readable after a reload
- **WHEN** the arch agent has, in one turn, listed agents, read a transcript and sent a task, and the Operator reloads the tab and opens the History lane
- **THEN** the three calls are listed under that turn's message with the Operator as actor, each with its sentence ("Sent a task to `<repo>` on branch `<b>`" for the send), status ok and elapsed time, and opening the send shows the full task text among the arguments and the send status and detail from the result

#### Scenario: A failed call stands out
- **WHEN** a call's result is an error
- **THEN** its card is marked error, "errors only" narrows the lane to it, and its parsed result shows the failing status and detail

#### Scenario: A running call is visible before the transcript has it
- **WHEN** an arch turn is running and the stream has reported a tool call that has no result yet
- **THEN** the History lane shows that call as running under a "now" group, and once the turn ends and the transcript carries the call with its result, it is shown once with its result

#### Scenario: Turn actor matches the Chat lane
- **WHEN** a turn was started by a harness wake-up prompt
- **THEN** the History lane groups its calls under "harness wake-up", the same actor the Chat lane's bubble shows

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

