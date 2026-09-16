## 1. Build

- [x] 1.1 `CardObservations` vocabulary; `Node.Observation` + `SetObservation`; list_tasks carries it.
- [x] 1.2 `observe_card` / `clear_observation` tools; catalogue; policeman policy; `DELETE nodes/{id}/observation`.
- [x] 1.3 Prompt: READ EVERY AGENT sweep, move-to-facts on every pass, PROVENANCE rule, verdict lines.
- [x] 1.4 Card: Agent section (`observationOf`), dismiss; styles.
- [x] 1.5 Policeman subtab: Conversation | How it works; `PolicemanExplainer` + `policemanDiagram.js` (two SVG state machines).
- [x] 1.6 The understanding app IS the full state diagram: `policemanStateMachine.js` (agent → pass → each card, validated) rendered by
      vendored cytoscape as the understanding app's first tab; evidence screenshots.

## 2. Verify

- [x] 2.1 Backend: `CardObservationTests`, `ArchPolicemanTests`, catalogue counts — full suite green.
- [x] 2.2 Client: `policemanDiagram.test.mjs`, `cardSections.observation.test.mjs` — suite green.
- [x] 2.3 Evidence: card sections (Agent section shown, dismissed inline), policeman conversation (explainer tab,
      both diagrams, 7 observations, 6 pass steps, can/cannot, provenance) — screenshots in docs/screenshots.
- [x] 2.4 Management App bundle rebuilt.

## 3. Ship

- [ ] 3.1 PR (stacked on `feat/policeman-syncs-cards`, includes the `feat/kanban-card-sections` merge); merge + deploy on the Operator's word.
