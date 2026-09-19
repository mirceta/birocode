# Tasks — policeman-responsibilities-tab

- [x] `policemanDuties.js`: the grouped rules (7 groups in pass order, 4 columns + source per row), `RULES` with the code's numbers, `VOCABULARY` from `OBSERVATIONS`, `filterRows`.
- [x] `policemanDuties.test.mjs`: every row complete; every reading state in Read, every attention state in Flag; numbers pinned; filter narrows and drops empty groups.
- [x] `PolicemanResponsibilities.jsx` + css: the view with filter box, counts, honest empty line, the vocabulary.
- [x] `PolicemanPanel.jsx`: the 📋 Responsibilities view between What it is and How it works; the choice remembered.
- [x] `client/tests/ui/shot-kanban-policeman-duties.mjs`: the table, the filter, the empty line, the remembered view; screenshots.
- [x] Rebuild the Management bundle; push into PR #122; rewrite the PR description to what the branch now holds.
- [ ] Operator: read the table; any row that reads wrong is either a wrong rule or a wrong row.
