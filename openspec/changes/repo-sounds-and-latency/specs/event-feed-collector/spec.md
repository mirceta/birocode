# event-feed-collector — delta for repo-sounds-and-latency

## ADDED Requirements

### Requirement: Prompt self-event ingestion, isolated from remote-source health

The collector SHALL ingest events from the built-in self source promptly and independently
of the health of any remote source. Publishing an event to the harness's own feed SHALL
trigger self ingestion immediately (not only on the next poll tick), so that when the
host-side cue is enabled, a self event is cued within about one second of being published.
Remote sources SHALL be polled independently of one another and of the self source, so
that a slow, dead, or timing-out remote source delays only its own ingestion — never
another source's and never the self source's. Publish-triggered ingestion SHALL never
block or fail the publishing operation, and SHALL NOT duplicate events also seen by the
periodic poll (the two paths SHALL share one watermark under mutual exclusion).

#### Scenario: A self event is cued promptly despite a dead remote source

- **WHEN** a registered remote source is unreachable (timing out) and a self event is published
- **THEN** the self event appears in the aggregate (and, when enabled, the host cue plays) within about one second, not delayed by the remote source's timeout

#### Scenario: Remote sources do not serialize each other

- **WHEN** two remote sources are registered and one of them times out on every pull
- **THEN** the other remote source's events keep being ingested on the normal poll cadence, unaffected by the dead source's timeout

#### Scenario: Publish-triggered ingestion does not duplicate events

- **WHEN** a self event is ingested via the publish trigger and the periodic poll also runs
- **THEN** the event appears in the aggregate exactly once

### Requirement: Per-repository host cue rules

The system SHALL let the operator assign host cue audio **per repository**, layered over
the existing global per-slot rules. A repo-scoped rule SHALL bind a repository name and a
slot (the same slot taxonomy as the global rules, including `_default`) to an uploaded
audio file stored on the host. When the collector ingests an event, the host cue SHALL be
resolved by precedence: the event's repository + type rule; else the repository's
`_default` rule (which in repo scope applies to **any** event type from that repository);
else the global rule for the type; else the global `_default` rule for unrecognized types;
else the built-in mode cue. The repository of an event SHALL be taken from the event
envelope's source (`repoName`), for self and remote events alike. The existing rule
endpoints SHALL accept an optional repository parameter selecting the repo scope; calls
without it SHALL keep today's global behavior unchanged, and rules persisted before this
change SHALL keep working unchanged as the global layer. The rules listing SHALL expose
the repo scopes and their rules alongside the global rules, and the per-slot host test
SHALL be able to play a repo-scoped rule's effective cue.

#### Scenario: A repo's own sound wins over the global rule

- **WHEN** repository R has a rule for `turn.ended` and a global `turn.ended` rule also exists, and a `turn.ended` event from R is ingested with the host cue enabled
- **THEN** the host plays R's file, not the global one

#### Scenario: A repo default covers all of that repo's events

- **WHEN** repository R has only a `_default` repo rule and a `turn.start` event from R is ingested with the host cue enabled
- **THEN** the host plays R's `_default` file rather than the global or built-in `turn.start` cue

#### Scenario: Events from other repos fall back to the global layer

- **WHEN** only repository R has repo rules and an event from repository S is ingested
- **THEN** the cue resolves through the global rules and built-ins exactly as before this change

#### Scenario: Pre-existing global rules keep working unchanged

- **WHEN** the harness restarts after this change with global slot rules persisted from before it
- **THEN** those rules load and play exactly as they did, with no re-upload or migration
