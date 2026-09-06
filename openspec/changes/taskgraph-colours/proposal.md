# Proposal: taskgraph-colours — colour-code tasks by machine (border) and repository (background), drop the machine boxes

## Why

The Task graph grouped tasks inside big machine boxes. The boxes cost space, hide
the free layout, and say only where a task runs; they say nothing about which
repository it belongs to, which is the other thing the operator reads off the board
(board task ce4eba2c, Operator 2026-09-06).

## What

1. **No outer boxes.** Tasks lie freely on the canvas; existing positions are kept.
   A task still linked to a legacy box renders at its absolute place and is re-saved
   once as absolute with the box link cleared. The "Machine" button is gone.
2. **Machine → border colour.** The machine of the task's assigned agent (this box
   or a fleet source) gets a stable, distinct hue; unassigned tasks keep a neutral
   border. A "Machines" legend is pinned above the canvas.
3. **Repository → background colour.** The repository — keyed by remote URL, so the
   same repo on two machines shares a colour, with the repo id as fallback — gets a
   stable, distinct, pale tint; unassigned tasks keep a neutral background. A
   "Repositories" legend sits next to the machines legend.
4. **Legible together.** One fixed hue palette (12 hues); borders are saturated and
   dark, backgrounds pale tints, so they never read as the same colour; text stays
   the theme's text colour. A dark-scheme block flips the lightness. Slots are
   assigned first-seen and persisted per device, so a machine or repo keeps its
   colour across reloads; beyond 12 the hues wrap.
5. **Legends follow the board** (entries and counts), sit outside the React Flow
   viewport so panning never moves them, and clicking an entry focuses it (dims the
   tasks that do not match); a second click clears.
6. Cross-machine dependencies stay dashed orange, now judged by the assignee's
   machine rather than by boxes. Kanban untouched.

## Out of scope

Removing the machine-box API (`/api/taskgraph/machines`) — orphaned like the old
scratchpad, pending a cleanup deploy; hue choice per machine/repo by the operator.
