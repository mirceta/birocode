## ADDED Requirements

### Requirement: Consuming an idea on promotion

Promoting an idea into a task SHALL CONSUME the idea: it is removed from the Ideas list
(every view and `list_ideas`) and retained on the board linked to the task it became
(the idea records the task id; the task already records the idea id). This applies to
every promotion path — the Management → Ideas "Send to graph" action, the Task graph and
Kanban, and the arch `idea_to_task` tool. A consumed idea is never deleted.

#### Scenario: Promote removes the idea from the list

- **WHEN** an idea is promoted into a task from any promotion path
- **THEN** it no longer appears in the Ideas list or in `list_ideas`, and the idea is
  recorded as consumed by that task

#### Scenario: Consumed ideas are visible on request

- **WHEN** the Ideas list or `list_ideas` is read with `includeConsumed` set
- **THEN** consumed ideas are included, each showing the task it became

#### Scenario: Consumed view

- **WHEN** the operator opens the off-by-default "Consumed" view in the Ideas panel
- **THEN** each consumed idea is shown with the task it became and a link to the card

### Requirement: Restoring a consumed idea when its task is deleted

Deleting the task an idea was promoted into SHALL restore that idea to the Ideas list as
inactive, keeping its original text, project, and priority. Completing or merging the
task (a status change, not a deletion) SHALL keep the idea consumed. Restoration SHALL
happen only for the idea consumed by exactly that task, so deleting one task never frees
an idea linked to another.

#### Scenario: Delete restores the idea

- **WHEN** a task that was promoted from an idea is deleted
- **THEN** the idea returns to the Ideas list as inactive with its original
  text/project/priority

#### Scenario: Done keeps it consumed

- **WHEN** a task promoted from an idea is marked done (or merged)
- **THEN** the idea stays consumed and does not return to the list

### Requirement: Migration of pre-existing promotions

On first run after this change, the harness SHALL mark every idea that already has a
task pointing at it (via the task's recorded idea id) as consumed by that task. The
migration MUST be idempotent.

#### Scenario: Existing promoted idea becomes consumed

- **WHEN** the harness starts and an idea already has a task referencing it
- **THEN** that idea is marked consumed by the task and leaves the Ideas list
