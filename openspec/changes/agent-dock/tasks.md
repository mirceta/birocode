# Tasks: agent-dock

## 1. Implement (events-app/index.html only)

- [x] 1.1 Reconstruction map fed from the existing event poll loop: sourceId → repo → {runs, open turnIds, lastAt, trail[≤50]}; turn.start opens, turn.ended closes/pairs (duration), finish-only runs supported; stale opens dropped after running-max-age
- [x] 1.2 Third tab "Agents" (Activity · Agents · GitHub): generic tabpanel CSS (hide all, show matching; display mode shows all), TABS array + panel markup with retention hint
- [x] 1.3 Dock render: card per source (Sources order, explicit empty note), squares per repo sorted by last activity with running badge + stats; trail drill-down in-card (newest first, status/duration/turns/cost), ✕ close; inert in display mode
- [x] 1.4 Light-theme styles for cards/squares/trail consistent with the restyle (status colors on dots/badges, ink text)

## 2. Verify

- [x] 2.1 Playwright: synthetic events injected through the real ingest path render two machine cards, repo squares with correct run counts, a lit running badge for an unmatched turn.start, and a finish-only square without one
- [x] 2.2 Playwright: square click opens the trail (duration on paired runs, status badges), ✕ closes; display mode shows the dock inert (no trail, no pointer); Activity/GitHub tabs regression suite still passes
- [x] 2.3 Empty state: fresh instance shows source cards with "no agent activity observed"

## 3. Ship

- [x] 3.1 `openspec validate agent-dock --strict` passes; understanding-app updated with the dock
- [ ] 3.2 events-app/ served from the working tree — live on reload once committed; operator confirms the dock on live with real fleet events
