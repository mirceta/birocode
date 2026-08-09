## Context

`DockToolbar.jsx`'s `matchesFilter` (after openspec dock-strip-filter-merge) evaluates, in order: the All short-circuit, the grid-visible exemption (`tab.dashboard !== false`), the `running` status test (`isRunning || isUnseen`), then branch classification. The `important` flag already arrives on every roster tab (server-persisted, openspec dock-toolbar-star-and-branch) and already renders as the ★ indicator and an aria-label fragment — the filter just doesn't consult it.

## Goals / Non-Goals

- **Goal**: an important dock's tab never leaves the strip, under any filter state, visible or hidden.
- **Non-goals**: no change to what `important` means elsewhere (star controls, grid borders, "show only important" grid filter), no new UI or i18n, no persistence or API changes, no change to the +N chip's derivation (it stays `tabs.length - visibleTabs.length`).

## Decisions

- **Exemption placement**: add `if (tab.important) return true;` immediately after the grid-visible exemption in `matchesFilter`, before the status and branch tests. Same shape as the existing exemption — one boolean short-circuit — so the two "always render" rules read as a pair. Alternative (OR-ing into each filter branch) repeats the condition three times for no benefit.
- **No dedicated tests for +N**: the chip already counts only excluded tabs; exempting important tabs from exclusion updates the count for free.
- **Comment update**: extend the header's grid-visible-exemption paragraph to name both exemptions and tag this change, keeping the file's convention of the header narrating filter semantics.

## Risks / Trade-offs

- [An operator who stars many docks makes the filters less useful] → intended semantics: important means "never lose sight of this", and the ★ on each exempt tab explains why it renders; clearing the star restores filtering.

## Migration Plan

Frontend-only, additive; ships with the normal build. Rollback = revert the commit.

## Open Questions

None.
