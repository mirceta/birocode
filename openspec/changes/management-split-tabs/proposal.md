# Proposal: management-split-tabs — Ideas, Task graph and Kanban as their own tabs; movable panes

## Why

The Management App's Ideas tab nests four things behind an inner tab strip: the ideas
list, the architectural plan, the Task graph and the Kanban. In the side-by-side layout
that means the graph or the board can never be shown next to the ideas list, and the
inner strip eats vertical space the boards need. The Operator asked for them to be
separate Management tabs, and for the panes to be rearrangeable.

## What

- **Three tabs instead of one:** Ideas (the list + the architectural plan), Task graph,
  Kanban. The `IdeasPanel` component gains a `view` prop (`all | ideas | graph |
  kanban`); the studio Ideas tab keeps the combined view, the Management App mounts the
  three views as separate tabs/panes. The standalone graph polls so tasks created in the
  Ideas pane or by the Tasks agent appear without a reload.
- **Movable panes:** in the side-by-side layout every pane bar gets ◀ ▶ that move the
  pane one step among the visible panes (hidden panes keep their slot); the order
  persists per device and the tab strip follows it. New tabs join at their default
  position without resetting a saved order.

## Out of scope

Drag-and-drop reordering, per-pane collapse, and changes to the studio Ideas tab.
