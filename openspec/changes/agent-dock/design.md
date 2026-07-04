# Design: agent-dock

## Decision 1 — client-side reconstruction from the poll the page already runs

The merged-feed poll (`/api/collector/events?after=watermark`) already delivers every event once; the dock ingests each event in that same loop into a map: `sourceId → { label, repos: repoName → { runs, running, lastAt, trail[] } }`. `turn.start` opens a run (keyed by `turnId`), `turn.ended` closes it (pairing gives duration) or records a finish-only run when no start was seen (old harnesses). Non-`turn.*` events are ignored — the dock is about agent runs. Trail arrays are capped (last 50 per repo) like the feed table's 300-row cap.

Why not server-side (the board endpoint computes derivations server-side)? The board rule exists so the *status* page is a dumb renderer of one poll. The dock consumes a *different, already-client-side* stream — the feed the merged-log table renders row by row. Reusing that stream adds zero requests and zero server state; a server-side version would duplicate the feed's retention window without extending it.

## Decision 2 — dock shape: machine cards → repo squares → trail

- One card per source, in the same order as the Sources panel; sources with no observed `turn.*` events render the card with an explicit "no agent activity observed" note.
- Inside a card, squares sorted by last activity (most recent first). A square = repo name + running badge (▶ n when open runs exist) + "n runs · last Xm ago".
- Clicking a square toggles the trail *inside that card* (newest first): `▶ started HH:MM` / `✔ done · 4m12s · 7 turns · $0.42` / `✖ error …` — finish-only rows render as `✔ done · HH:MM` without duration. The ghPanel pattern (one open panel, ✕ to close) is reused, scoped per card.

## Decision 3 — degrade visibly when `turn.start` is missing

Old harnesses emit only `turn.ended`. A square whose trail contains only finish events shows stats but can never light the running badge; the trail rows still render. Nothing infers "running" from anything but an unmatched `turn.start` — a stale unmatched start older than the board's running-max-age is dropped from "running" (same guard the board applies server-side), so a crashed agent doesn't stay lit forever.

## Decision 4 — tabs go generic; display mode shows the dock, inert

Three panels make pairwise hide rules noisy; the CSS becomes: hide every `.tabpanel`, show the one matching `body[data-tab]`, and `body.display .tabpanel{display:block !important}` unchanged. The Activity wide-screen grid stays scoped to `body[data-tab="activity"]`. In display mode the dock renders (running lights are exactly wallboard material) but is inert: no pointer affordance, trail hidden — the same contract as the GitHub tiles.

## Retention honesty

The dock reconstructs only what the collector's retained feed still holds; after a harness restart the dock starts empty. The tab carries a one-line hint ("reconstructed from the recent event trail") so an empty dock reads as "no recent activity observed", never "nothing ever ran".
