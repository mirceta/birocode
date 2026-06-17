# Understanding — Autopilot goes to the harness

## Goal
Promote the autopilot **dashboard** from its current home — the build-less per-repo local app
`autopilot-app/` (served under `/api/localview/<repo>/app/autopilot/`) — **into the harness
itself** as a first-class React surface. This finishes the migration to the "option A" home
that `plans/loop-autopilot-dashboard.md` locked but only shipped as an interim local app.

## What I've done in this kickoff
- Confirmed `main` was synced with `origin/main` (0/0), then created
  **`feature/autopilot-to-harness`**.
- Surveyed the existing autopilot: backend already lives in the harness
  (`Services/Autopilot/*` + `AutopilotController`); the dashboard lives as the build-less
  `autopilot-app/` local app with four subtabs; `client/src/pages/Autopilot.jsx` (the Slice-1
  discovery tab) is the target home.
- Wrote `plans/autopilot-to-harness.md` + an **Active feature plans** entry in `plan.md`.

## My interpretation (you declined to pin it, so this is the default)
"Goes to the harness" = **UI relocation/consolidation**: re-implement the four `autopilot-app/`
subtabs (Agents / Intercepted / Suggestion history / Auto-sent) as React inside the harness
Autopilot tab, reading the same `/api/autopilot` data (plus in-process state where it helps),
then retire the local app. Backend and the operator gate stay unchanged.

## Open questions (flagged in the plan — tell me which way)
- UI-relocation **only**, or also **harness-level cross-agent operation** (one autopilot over
  the whole dashboard wall rather than per-repo arm sets)?
- Should it explicitly target the **Harness's own repo** (Self-Development)?
- Does this also mean **ungating** it into an always-on capability? (Default: no — keep the gate.)

## Assumptions
- This kickoff = branch + plan + interpretation; the build follows once scope is confirmed.
- The brain/engine/gate/safety are out of scope; only where the dashboard lives changes.
