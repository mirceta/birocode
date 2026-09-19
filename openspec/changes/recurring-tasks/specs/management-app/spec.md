## ADDED Requirements

### Requirement: Recurring tab lists recurring tasks as one column of cards

The Management App SHALL offer a **Recurring** tab, placed after Kanban by default and
addressable with `?tab=recurring`, showing the recurring tasks as a single column of cards
— needs-attention first, then by next run, paused last. A card SHALL show its title, the
assigned repo agent with the same chip, colours and worker-window button a Kanban card
uses, the schedule in words, when the next run is due or the reason it is being held, the
last run's outcome, and a strip of its most recent runs coloured by outcome. Expanding a
card SHALL show its instructions and schedule for editing, its options, **Run now**,
Pause/Resume, Delete, and its run history (when, trigger, outcome, summary, duration),
newest first. The tab label SHALL carry the number of cards needing attention. While the
Operator's autopilot gate is closed the tab SHALL say so and SHALL offer no way to send.

#### Scenario: Reading the fleet's chores at a glance

- **WHEN** the Operator opens the Recurring tab with four tasks, one of which last ended
  with `RUN ATTENTION`
- **THEN** that card is first with an attention badge and its amber square at the end of
  its run strip, the others follow by next run, and the tab label reads "Recurring 1"

#### Scenario: Run now

- **WHEN** the Operator presses Run now on a card whose agent is idle
- **THEN** the instructions are sent at once with trigger manual, the card shows the run
  in progress, and the schedule's next occurrence is unchanged
