# Design: arch-branch-handover

## D1 — One record, three kinds of arch branch

`assignments/<repoId>.json` in the arch home (`ArchClaims.Assignment`) grows from "the
branches the arch asked for in sends" (`Branches`) to three lists that all make a branch
the arch's: `Adopted` (handed over by the Operator, revocable), `TaskBranches` (task id →
the branch the assignee created for a dispatched task), plus `Pinned`. `ArchBranches` is
their union and the only thing the rule reads. Old files (six fields) deserialize as-is;
`Normalized()` fills the new lists.

Revoke removes the branch from `Adopted` AND `TaskBranches` AND `Branches`: "take back"
means the Operator's, whoever put it there.

## D2 — The rule, pure

`ArchClaims.Classify(managed, busy, branch, default, archBranches, pinned, lastHumanAt,
now, window)` → `Verdict(availability, claimedReason)`:

| case | availability | claimedReason |
|---|---|---|
| unmanaged / busy | as before | – |
| pinned | claimed | `pinned` |
| default branch, unknown branch, arch branch | available | – |
| unassigned branch, human turn within the window | claimed | `human-active` |
| unassigned branch, no human turn in the window | available | `unassigned-branch` |

`availability` keeps its four values so every consumer (docks, peers on older builds,
the fleet status filters) keeps working; the reason rides alongside. The service binds
the table in `VerdictOf`, replacing the old static `Classify` at every call site
(availability, list_agents, git_state, the sends, the transcript reads, the peer describe).

**Human activity** = the latest local `turn.start` on the repo that is not the arch's own
turn. The feed's `turn.start` carries no actor, so an arch turn is recognised the way the
dock's last-actor label already does: it starts within 15 s after an arch send. The service
keeps the arch send times per repo in memory (`NoteArchSend`), seeded once per process from
the audit log (the last 500 rows, kind `arch`, outcome `arch`), so a restart errs towards
claimed, never towards available. Fleet sends received through the peer API count as arch
sends too (they go through `StartRepoTurn`).

**Window**: `ArchStateStore.ClaimWindowMinutes` (0 = default 2 h), `POST /api/arch/claim-window`,
reported in the arch state and the claim posture.

## D3 — The name-the-branch rule

On `unassigned-branch` a send is refused as `state-branch` unless the task text contains
the branch name or the send's `branch` argument is that branch (`ArchClaims.SendNamesBranch`).
Applied in `SendLocal` and `PeerSendTask`, so a hub's arch gets the same answer from a peer.
The refusal text tells the arch exactly what to add.

## D4 — Hand-over surfaces

- `ArchAgentService.HandOver(repoId, branch?, adopt, by)`: branch defaults to the checked-out
  one; the default branch cannot be adopted (never claimed); writes the record, drops the
  20 s git-state cache entry, audits `adopt_branch` with `ArchClaims.HandoverOutcome`,
  publishes `arch.handover` on the feed. `PinRepo` likewise.
- Operator: `POST /api/arch/handover { repoId, branch?, action: adopt|revoke|pin|unpin, sourceId? }`
  and `GET /api/arch/claim?repoId=` for the dock control (`HandToArch.jsx`, in the dock's
  git block and the Status card; feature `archHandover`, Advanced). A `sourceId` relays
  adopt/revoke to the peer's `POST /api/arch/peer/handover`, which applies the fleet-send
  trust (accept-sends opt-in + gate + managed there) and records in ITS assignments — the
  peer's own describe is what decides a remote repo's availability, so that is where the
  record must live.
- Arch: `adopt_branch` → `AdoptGate(operatorAsked)` first (pure, refuses `not-asked` and
  audits), then local `HandOver(by: "arch (the Operator asked)")` or `FleetClient.HandOver`.

## D5 — dispatch_task and its branch

`dispatch_task(id, branch?)`: the brief gets a "Branch: work on `x`" line, the send carries
`branch`, and on `sent` the branch is recorded under the task id immediately (local). The
branch watch `RecordDispatchedTaskBranches()` runs at the top of every `ComposeWake` tick:
for each local task in `doing` with a `DispatchedAt`, the cached git branch is recorded
under the task id when it is a non-default branch the arch does not know
(`ArchClaims.TaskBranchToRecord`). Remote assignees are out of reach here (their assignments
are theirs); the arch can still `adopt_branch` on the Operator's ask.

## D6 — read_transcript override

`ToolReadTranscript(machine, repoId, tail, overrideClaimed)`; local reads audit
`claimed-override`, remote reads pass `override=true&from=<hub>` to the peer's transcript
endpoint, which audits `claimed-override from <hub>`. A peer that predates the field ignores
it and answers `claimed`, as with the send override.

## D7 — Tests

Everything new is reachable without a harness: `ArchClaims` (rule, window, human-turn
detection over collector events, name-the-branch, task-branch watch, audit wording, the
record's operations and JSON round trip incl. a legacy file), `AdoptGate`,
`DispatchMessage` with a branch, and the MCP catalogue (sixteen tools, `adopt_branch`
requires `operatorAsked`, `read_transcript` has it, `dispatch_task` has `branch`). The
existing rule table keeps its rows with "human active one minute ago" as the activity
input. `ArchHandoverTests.cs`, plus the amended `ArchAgentTests.cs`.
