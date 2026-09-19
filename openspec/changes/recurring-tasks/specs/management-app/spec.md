## ADDED Requirements

### Requirement: Recurring tab lists recurring tasks as one column of cards

The Management App SHALL offer a **Recurring** tab, placed after Kanban by default and
addressable with `?tab=recurring`, showing the recurring tasks as a single column of cards
— needs-attention first, then by next run, paused last. A card SHALL show its title, the
assigned repo agent with the same chip, colours and worker-window button a Kanban card
uses, the schedule in words, when the next run is due or the reason it is being held, the
last run's outcome, and a strip of its most recent runs coloured by outcome. While a run is
in progress the card SHALL show the goal loop's phase (work or verify) and its turn count.
Expanding a card SHALL show its instructions, schedule, run mode and turn budget for
editing, its options, **Run now**, **Stop run** while one is running, Pause/Resume, Delete,
and its run history (when, trigger, outcome, summary, how the loop ended and in how many
turns, duration), newest first. The tab label SHALL carry the number of cards needing
attention. While the Operator's autopilot gate is closed the tab SHALL say so and SHALL
offer no way to start a run.

#### Scenario: Reading the fleet's chores at a glance

- **WHEN** the Operator opens the Recurring tab with four tasks, one of which last ended
  verified with `RUN ATTENTION`
- **THEN** that card is first with an attention badge and its amber square at the end of
  its run strip, the others follow by next run, and the tab label reads "Recurring 1"

#### Scenario: Run now

- **WHEN** the Operator presses Run now on a card whose agent is idle with a free loop slot
- **THEN** the goal loop is armed at once with trigger manual, the card shows work then
  verify as the loop advances, and the schedule's next occurrence is unchanged
