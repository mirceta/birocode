## 1. Build

- [x] 1.1 `taskFilterSummary.js`: summary chips (bar order, labels, text as one chip), `withoutChip`, `activeCount`, `summaryLine`, fold read / write (default collapsed).
- [x] 1.2 `TaskFilterBar`: the toggle (chevron + Filters + badge, `aria-expanded`, keyboard), the collapsed line (chips with ×, clear all, shown count, `extra`), the expanded controls unchanged; the fold shared per browser.
- [x] 1.3 `taskfilters.css`: the fold is the sticky block; collapsed is one line; summary chip and × styles follow the selected chip.

## 2. Verify

- [x] 2.1 node tests: chips / remove-one / count / line / fold state (`taskFilterSummary.test.mjs`, in `npm test`).
- [x] 2.2 UI (`shot-kanban-collapsible-filters.mjs`): collapsed by default; Enter expands, Space folds; three filters → three chips + badge 3; a chip's × clears one without expanding and the URL follows; fold + filter survive a reload; clear all; the layout toolbar sits ≤ 12 px under the folded line; the Task graph shares the fold. Screenshots before / collapsed / graph at 1380×760.

## 3. Ship

- [ ] 3.1 PR with the screenshots; merge + deploy on the Operator's word.
