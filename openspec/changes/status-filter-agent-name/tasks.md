# Tasks — status-filter-agent-name

## 1. Implementation

- [x] 1.1 `agentQuery.js`: pure haystack (name + full handle + visible chip label + branch + URL + machine) and multi-word AND matcher
- [x] 1.2 `FleetStatus.jsx` uses the module (behaviour otherwise untouched; composes with machine + state chips as before)

## 2. Verification

- [x] 2.1 `agentQuery.test.mjs` in the client suite: chip-label match (the case the old haystack lost), casing, AND, empty box, missing fields
- [x] 2.2 Evidence shots `shot-status-name-filter.mjs`: before / typed ("autodev#1" → 1 of 4, machines collapse) / composed with the occupied chip / no-match note / × clear — all asserted
- [x] 2.3 Client suite green; bundles rebuilt; openspec validate --strict
