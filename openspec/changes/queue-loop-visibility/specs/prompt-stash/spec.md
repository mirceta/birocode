# prompt-stash — delta for queue-loop-visibility

## ADDED Requirements

### Requirement: The stash strip reconciles engine-side consumption while visible

Stash strips SHALL converge on the server's stash state while the page remains
visible, without requiring a tab switch or refocus: when an armed queue loop
consumes an item, the strip SHALL drop that chip within the client's normal
reconcile interval. Client-side optimistic edits (add, remove, reorder) SHALL
NOT be visibly reverted by a reconcile that races an in-flight mutation — the
strip converges to server truth on a subsequent reconcile.

#### Scenario: A draining queue visibly shrinks on a watched page

- **WHEN** a drive-mode queue loop consumes the head stash item while the operator keeps the dashboard visible
- **THEN** the consumed chip disappears from the strip within the reconcile interval, with no refocus or navigation

#### Scenario: An optimistic reorder is not clobbered by a racing reconcile

- **WHEN** the operator reorders the strip and the reconcile fires while the reorder request is still in flight
- **THEN** the strip keeps the operator's order and converges with the server on a later reconcile

### Requirement: The strip discloses its queue binding while a queue loop is armed

While a queue loop is armed on a tab, that tab's stash strip SHALL render as
the live queue: items SHALL be numbered in unload order, and the head item
SHALL be marked as in flight while the loop is executing or verifying a step
and as next-up otherwise, with a visible queue-armed treatment on the strip.
Tabs without an armed queue, and the global (tab-independent) stash, SHALL
render unchanged. The marking SHALL derive from the ungated loop status
projection only (kind, active, bound tab, phase) — no additional prompt-text
disclosure.

#### Scenario: Armed tab's strip shows order and head state

- **WHEN** a queue loop is armed on a tab whose stash holds ["A", "B"] and the engine is mid-step
- **THEN** that tab's strip numbers A=1 and B=2 and marks A as in flight; once the loop idles between unloads the head is marked next-up instead

#### Scenario: Unarmed surfaces are unaffected

- **WHEN** no queue loop is armed on a tab (or the strip shows the global stash)
- **THEN** the strip renders with today's plain chips — no numbering, no head marking, no queue accent
