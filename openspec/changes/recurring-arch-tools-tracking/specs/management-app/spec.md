## MODIFIED Requirements

### Requirement: Recurring tab lists recurring tasks as one column of cards

The Management App SHALL offer a **Recurring** tab, placed after Kanban by default and
addressable with `?tab=recurring`, showing the recurring cards as a single column —
needs-attention first, then by next run, tracking-only cards after the scheduled ones, paused
last. A prompt-driven card SHALL show its title, the assigned repo agent with the same chip,
colours and worker-window button a Kanban card uses, the schedule in words, when the next run
is due or the reason it is being held, the last run's outcome, and a strip of its most recent
runs coloured by outcome; while a run is in progress it SHALL show the goal loop's phase and
turn count; expanded, it SHALL offer its instructions, schedule, run mode and turn budget for
editing, its options, **Run now**, **Stop run** while one is running, Pause/Resume, Delete, and
its run history, newest first. A **tracking-only** card SHALL be visibly distinguished from the
prompt-driven kind, SHALL show its agent, title and description (and the local app it names,
with a link to that app on the agent's harness when the harness address is known), SHALL show
no schedule, run strip or history, and its main action SHALL be **Open harness** — the same
per-agent tab the Kanban badge opens (one tab per agent, focused without reload); expanded, it
SHALL offer its fields for editing and Delete. The tab SHALL offer a composer for each kind;
the tracking composer SHALL list this machine's registered local apps for an agent here and
take a plain app id for a peer's agent. The tab label SHALL carry the number of cards needing
attention. While the Operator's autopilot gate is closed the tab SHALL say so, SHALL offer no
way to start a run, and SHALL leave tracking-only cards unaffected.

#### Scenario: Reading the fleet's chores at a glance

- **WHEN** the Operator opens the Recurring tab with four tasks, one of which last ended
  verified with `RUN ATTENTION`
- **THEN** that card is first with an attention badge and its amber square at the end of
  its run strip, the others follow by next run, and the tab label reads "Recurring 1"

#### Scenario: Run now

- **WHEN** the Operator presses Run now on a card whose agent is idle with a free loop slot
- **THEN** the goal loop is armed at once with trigger manual, the card shows work then
  verify as the loop advances, and the schedule's next occurrence is unchanged

#### Scenario: Going to look at a job that runs by itself

- **WHEN** the Operator presses Open harness on the tracking card of the nightly import
- **THEN** the birokrat-web agent's own tab is opened (or focused if it already exists) at
  its dock, without reloading it, and nothing is sent to the agent
