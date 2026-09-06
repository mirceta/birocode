# ideas-consume-on-promotion — promoting an idea to a task consumes it

## Why

When an idea is promoted into a task (Management → Ideas "Send to graph", the Task
graph / Kanban, or the arch `idea_to_task` tool), the idea today stays in the Ideas
list — it only loses its `active` flag. It keeps cluttering the list and distracts
from the ideas that have not yet become tasks. There is no signal that "this idea is
already a task", and nothing links the two for the operator beyond the task card's own
`ideaId`.

## What Changes

- **Promotion consumes the idea.** Creating a task from an idea marks the idea
  CONSUMED: it disappears from the Ideas list (every view and `list_ideas`) and is
  kept on the board linked to the task id. Applies to every promotion path, because
  they all funnel through `TaskGraphService.AddNode` (the UI POST and the arch
  `idea_to_task` tool).
- **Consumed, not deleted.** A consumed idea is retained and shown in an off-by-default
  "Consumed" view that names the task it became and links to the card.
- **Deleting the task restores the idea** as inactive with its original
  text/project/priority. Completing or merging the task (a status change, never a
  delete) keeps the idea consumed.
- **`list_ideas` gains `includeConsumed`** (default false); `idea_to_task` returns the
  consumed idea's handle and the new task id. Tool descriptions updated.
- **Migration:** on first run, any idea that already has a task pointing at it
  (`task.ideaId`) becomes consumed.

## Non-goals

- No change to idea priorities / active semantics beyond consumption.
- No automatic promotion — promotion stays an explicit operator/arch action.
