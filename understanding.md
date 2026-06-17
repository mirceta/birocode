# Understanding — Autopilot "Intercepted" feed

## Goal
Add a new subtab to the Autopilot local app that **proves the engine is really
intercepting agent prompts**: a live, append-only feed of every message the
engine grabs off an idle agent, showing it move through `intercepted → now
processing` (a rolling spinner while in-flight) → its outcome (`suggested` /
`escalated` / `sent`).

## What "intercept" means here
Each engine tick (~10s) the engine looks at every armed, idle agent, reads its
last assistant message, and asks the brain to classify it. That read+classify
is the interception. Today only the *verdict* is logged (the `log` =
"Suggestion history"); the intercepted **message itself** and a **processing
phase** are not surfaced — so there's no live "it's working right now" signal.

## Backend (`AutopilotService`)
- Add an in-memory ring buffer of `InterceptEvent` (cap 50), exposed as
  `intercepts` in the `/api/autopilot` state.
- An event carries: `id`, `at`, `repoName`, `snippet` (the intercepted message),
  `phase` (`processing` | `done`), `outcome` (`suggested`/`escalated`/`sent`,
  null while processing), `label`, `confidence`, `doneAt`.
- Record one event when a **new** trailing message is intercepted (dedup by
  repo+snippet — so the feed lists *new* intercepts, not the same idle message
  every 10s).
- Suggest-only path: the event resolves to `done`/`suggested|escalated` in the
  same tick.
- Auto-advance send: the event stays `processing` until the resumed run
  actually completes (flipped in the `TrySend` `Task.Run` finally) — so the
  spinner reflects a *real* in-flight send, not a fake delay.

## Frontend (`autopilot-app/`)
- New `Intercepted` subtab (live pulse dot), newest first.
- Each row: time · repo · the intercepted message snippet · status.
- Status: `processing` → a CSS rolling spinner + "processing…"; `done` → the
  outcome pill (+ the routine label for suggested/sent).
- A freshly-arrived row shows the spinner briefly on first appearance before
  revealing its outcome, so every interception is visibly "caught then
  processed" — honest, since it genuinely was just intercepted this cycle.

## Assumptions
- Stub brain classifies instantly, so the only multi-second spinner today is a
  real auto-advance send; suggest-only rows resolve fast (brief reveal spinner).
- Keep the understanding-app design mock in sync (add the same 4th subtab).
- Backend change ⇒ a self-dev rebuild + (when you say so) a redeploy of the
  harness; the `autopilot-app/` static files go live on save.
