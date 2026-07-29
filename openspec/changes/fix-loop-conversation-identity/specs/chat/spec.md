# chat — delta

The chat client discovers backend runs only on mount, tab-visibility, its own
send, or a manual refresh — a run started by the autopilot engine on an open,
visible page never attaches. This delta adds continuous discovery so
backend-started runs surface like the client's own.

## ADDED Requirements

### Requirement: Client attaches to backend-started runs while the page is open

While the page is visible, the chat client SHALL periodically check the
backend's run snapshot and attach to any running builder-lane run it has no
live reader for, using the same attach path as reconciliation after a reload.
Once attached, the conversation SHALL present the run exactly like a turn the
client started itself: the transcript backfills, events stream in, the busy
state is set, and the composer's Send control becomes Stop. The check SHALL be
suspended while the page is hidden (the existing visibility reconcile covers
the return) and SHALL NOT duplicate events or attachments when a reader is
already live.

#### Scenario: Engine-started run appears without a refresh

- **WHEN** the autopilot engine starts a run for a repo whose dock chat is open and visible with no turn in progress
- **THEN** within a few seconds the chat attaches, streams the run's events as normal assistant bubbles, and shows the Stop control until the run completes

#### Scenario: No double-attach over a live stream

- **WHEN** the periodic check runs while the client already has a live reader for the repo's run
- **THEN** no second attachment is made and no events are duplicated
