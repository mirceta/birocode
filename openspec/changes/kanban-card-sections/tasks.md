## 1. Build

- [x] 1.1 `cardSections.js`: `progressOf`, `progressNote`, `boardCheckOf` (+ `plainUnverifiedReason`,
      `isUnverified`, `SOURCES`), `linksOf`; unit tests.
- [x] 1.2 `KanbanBoard.jsx`: card body = Header (title row + assignees) · Progress · Board check
      (with inline Resolve) · Links (`<details>`); badge row, detail warning/linkage/human/manual
      blocks removed.
- [x] 1.3 `kanban.css`: sections, steps, check tones, links list.
- [x] 1.4 Evidence: `client/tests/ui/shot-kanban-card-sections.mjs` → docs/screenshots.

## 2. Verify

- [x] 2.1 Client suite green; evidence run green (no raw reason strings, every check names a
      source, Resolve inline, drag intact); Management App bundle rebuilt.

## 3. Ship

- [ ] 3.1 PR against main; merge + deploy on the Operator's word.
