## ADDED Requirements

### Requirement: The dashboards' agent views come from a background snapshot

The harness SHALL compute the local agent views (every repo that is managed or holds a dock,
with its branch, dirtiness and availability) in a background pass every ten seconds, with the
repos' git states read in parallel under the git spawn gate, and the polled endpoints — the
Arch tab's state and the Fleet Status poll — SHALL serve the last snapshot without reading git
on the request thread. The payloads SHALL carry when the snapshot was taken and how long the pass took.
The first request after start, before the first pass, MAY compute the snapshot once. A
concurrent miss on one repo's git-state cache SHALL share a single read. The `list_agents` tool
SHALL still read fresh.

#### Scenario: The Arch tab's state is milliseconds, whatever the repos cost

- **WHEN** eight managed repos each take a second of git to describe and three dashboards poll
  the arch state and the fleet status every few seconds
- **THEN** every poll answers from the snapshot in milliseconds, git is read once per repo per
  snapshot pass, and the payload says the snapshot's age

#### Scenario: A repo changes branch

- **WHEN** a managed repo's checked-out branch changes
- **THEN** the Arch tab shows the new branch within one snapshot interval plus the git-state
  cache's lifetime

### Requirement: A dark peer is not re-dialled on polling paths

While the collector has a source in its unreachable backoff, the fleet client SHALL answer the
peer snapshot as `unreachable` without dialling, and SHALL answer peer reads (the requests pull,
hub files, loops, upgrade status) as `unreachable` at once with the next-try time. An
`unreachable` describe verdict SHALL otherwise be kept for sixty seconds before a re-dial. Peer
acts (a send, a decision, an upgrade) SHALL still dial. The Fleet Status tab and the Arch tab's
Fleet card SHALL show, for a machine the hub cannot reach, the reason, the failed-poll count and
the retry countdown.

#### Scenario: The requests tab does not wait on a dead peer

- **WHEN** the Repo Agent Requests tab polls while a fleet source is backed off
- **THEN** the pull answers at once with that source named `unreachable` and the next-try time,
  no HTTP request is made to it, and the other peers are pulled

#### Scenario: The Operator sees why a machine is dark

- **WHEN** a fleet machine has not answered for five polls
- **THEN** its Fleet Status card says `unreachable — timed out · 5 polls in a row · retry in N s`
  and the countdown ticks down to the next dial
