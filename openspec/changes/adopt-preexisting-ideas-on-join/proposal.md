# adopt-preexisting-ideas-on-join — define what happens to a node's own ideas when it joins the shared board

## Why

The old system was per-node: every harness kept its own local ideas board and
nothing else existed. The new system is the shared store (harness hub or Apps
Script). The transition between the two was never defined: when a node that
already holds ideas of its own is pointed at a shared store for the first time,
no requirement says what happens to those pre-existing ideas.

Today they survive only **by accident**: the first exchange after configuring
sync is a poll, whose merge sets a `RemoteStale` heuristic ("local holds
something the remote lacks"), which schedules a debounced push. The right
outcome emerges from machinery built for a different purpose (offline edits),
is not stated in any requirement, has no test, and nothing guarantees it is the
FIRST thing that happens on join.

## What Changes

- **Defined behavior**: joining a shared store — enabling sync, or re-pointing
  the sync URL at a different store — makes the node's FIRST sync action a
  pull-merge-CAS-push exchange that uploads every pre-existing local idea into
  the shared store (through the normal per-note tombstone-aware merge, so
  nothing remote is lost either).
- **Structural, not emergent**: `IdeasSyncService.Nudge` learns "first contact"
  (target changed OR sync just became enabled) and marks the board dirty with
  an immediate push due, so the seeding exchange runs on the next engine tick —
  ahead of, and instead of, the plain poll. The `RemoteStale` heuristic remains
  as the ongoing safety net.
- **Proof**: a two-instance isolated e2e where the joining node holds ideas
  born before sync was ever configured, asserting the hub ends up with the
  union and nothing on either side is lost, including the offline-join retry
  path.

## Capabilities

### Modified Capabilities
- `ideas`: the link-configured shared store gains a defined join/transition
  behavior — pre-existing local ideas are adopted into the shared store as the
  first sync action on first contact.

## Impact

- **Backend**: `IdeasSyncService.Nudge` signature gains a first-contact flag;
  `NotesController.PutSyncConfig` computes it from the before/after config
  (enabled flipping on, or the URL changing). No new state, endpoints, or wire
  changes.
- **Frontend**: none.
- **No storage changes**: notes.json, sync config, and the hub contract are
  untouched.
