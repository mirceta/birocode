# prompt-stash — delta for queue-based-loop

(Seeds the capability per seed-and-grow; the stash predates this spec —
plans/prompt-stash.md is its history.)

## ADDED Requirements

### Requirement: The per-tab stash is an ordered, operator-reorderable list

Each dock tab's prompt stash SHALL be an ordered list, and the operator SHALL be
able to reorder it — from the stash strip above the composer and via a reorder
API taking the full ordered id list — at any time, including while a queue loop
is armed on the tab. The resulting order SHALL be durable and shared across
devices like the rest of the tab. A reorder request naming an id no longer
present (e.g. consumed by an armed queue in the meantime) SHALL apply the order
of the remaining ids and ignore the missing one, rather than failing.

#### Scenario: Reordering the stash persists

- **WHEN** the operator moves a stash item above another in the strip
- **THEN** the stash lists the items in the new order, and the order survives reload and is what any armed queue unloads next

#### Scenario: Reorder racing a queue consume degrades gracefully

- **WHEN** a reorder request includes an id the armed queue consumed a moment earlier
- **THEN** the remaining items take the requested relative order and the request succeeds
