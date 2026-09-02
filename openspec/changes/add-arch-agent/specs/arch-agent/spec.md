## ADDED Requirements

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
`actor: "arch"`, run on the dock's existing session, and write an audit line with
kind `arch`. The bubble SHALL appear exactly where a human message would.

#### Scenario: Arch task visible in the dock
- **WHEN** the arch agent sends a task to a managed repo
- **THEN** the repo's dock shows a user bubble tagged `arch` with the task text, followed by the repo agent's reply

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
a persisted watermark, keep `turn.start` and `turn.ended` events whose source is a
managed repo, and when any exist SHALL propose one arch turn whose prompt describes
them. It SHALL ignore `chat.focus`. When nothing new exists it SHALL hold. On a
missing watermark it SHALL start from the collector's current last sequence and
SHALL NOT replay history. It SHALL publish an `arch.wake` event when it sends a wake
prompt.

#### Scenario: Repo turn ends, arch agent wakes once
- **WHEN** a managed repo publishes `turn.ended` and the next tick runs
- **THEN** exactly one arch turn runs with a prompt naming that repo, its status, turn count and elapsed time, the watermark advances past the event, and an `arch.wake` event is published

#### Scenario: Unmanaged repo and chat.focus do not wake
- **WHEN** only `chat.focus` events or events from unmanaged repos arrive since the watermark
- **THEN** the loop holds, no arch turn runs, and the watermark still advances

#### Scenario: Fresh watermark does not replay
- **WHEN** the arch loop is armed for the first time with events already in the feed
- **THEN** the watermark is set to the current last sequence and no wake prompt is composed from past events

### Requirement: Repo identity and send addressing are fleet-shaped
`list_agents` SHALL return, per managed repo, the machine (`self`), repo id, name,
git remote URL, branch, availability, last actor, and running-since when busy.
`send_task` SHALL address a target by machine and repo id, with machine limited to
`self` in this capability.

#### Scenario: Agents listed with remote URL
- **WHEN** the arch agent calls `list_agents`
- **THEN** each managed repo entry includes its `remoteUrl` (empty when none) and `machine: "self"`

#### Scenario: Send to a non-self machine is refused
- **WHEN** `send_task` is called with a machine other than `self`
- **THEN** the tool returns an error naming the unsupported machine and nothing is sent

### Requirement: The Arch tab is the arch agent's own surface
The web UI SHALL provide a top-level Arch tab, available in Advanced mode only,
showing the arch conversation (Operator messages, arch replies, wake prompts
distinguished as system-originated), a managed-agents strip with each repo's
availability, branch, last actor, elapsed time, and a control that opens the repo's
real dock, a scope picker for the managed set, and the loop header controls (arm,
suggest/drive, cap, Stop). Unmanaged repos SHALL be invisible to the arch agent's
tools.

#### Scenario: Operator manages two of three repos
- **WHEN** the Operator selects two repos in the scope picker
- **THEN** `list_agents` returns only those two, and the strip shows only those two

#### Scenario: Stop is one click
- **WHEN** the Operator presses Stop in the Arch tab
- **THEN** the arch loop is disarmed immediately, the strip keeps showing any repo turn still running, and the Basic-mode UI is unaffected

### Requirement: The Arch tab has a Chat lane and a Tools lane
The Arch tab's main column SHALL offer two lanes in the style of a repo dock's lane
row: **Chat** (the arch conversation and composer, the default) and **Tools**. The
Tools lane SHALL list the harness-served tools exactly as the arch session receives
them from the MCP server's `tools/list` (name, description, parameters with type and
required-ness, and the call name the session uses), per-tool usage read from the
action audit (call count, last call time and outcome, target repo when any), the
built-in CLI tools the session is denied, and a preflight that checks the live
surface (MCP server answers `tools/list` with the full catalogue, the bearer token
validates, the home repo exists or is reported as created-on-arm, at least one
managed repo, autopilot gate and kill switch). The Tools lane SHALL have nothing to
save: the surface is fixed by the harness. The managed-agents strip and loop
controls SHALL stay visible in both lanes.

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
- **WHEN** the Operator switches to Tools and back to Chat
- **THEN** the conversation, the composer draft and the managed-agents strip are as they were

#### Scenario: Desktop reaches the same surface from the dashboard
- **WHEN** the Operator opens the dashboard in Advanced mode and presses the Arch chip on the panel rail
- **THEN** the Arch surface opens as a centered pop-up over the docks (same mechanism and persistence as the Ideas/Autopilot/Audit/Traffic pop-ups), the chip is pressed while it is open, Esc or × dismisses it, and "open dock" closes the dashboard onto that repo's dock; in Basic mode the chip is absent
