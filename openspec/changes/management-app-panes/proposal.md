# Proposal: management-app-panes — side-by-side layout for the Management App

## Why

The Management App shows Arch, Ideas and Events one at a time. The harness itself
already has a better answer on a wide screen: the multi-pane strip (the view behind
the machine/project chip), where tabs render next to each other. The operator wants
the same for the management surface: the three views side by side, resizable
borders, and the option to hide a view.

## What

- A **layout switch** in the Management App header: **Tabs** (today's behaviour) or
  **Side by side**. Persisted per device; `?layout=` in the URL wins.
- **Side by side** renders every visible view as a column with a slim pane bar
  (label + hide ×). The header's tab buttons become visibility toggles; the last
  visible pane cannot be hidden.
- **Resizable borders**: a draggable gutter between neighbouring panes trades width
  between them (pointer events, pointer capture so the drag survives the events
  iframe); widths persist per device as proportional weights.
- Narrow windows (< 720 px) fall back to tabs while keeping the choice.

No harness change: the Management App is a static bundle served from the worktree,
so rebuilding it is the whole deploy.

## Out of scope

Reordering panes; the harness's Management dashboard layer keeps embedding the app.
