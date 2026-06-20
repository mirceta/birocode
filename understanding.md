# Understanding — System Tests sub-tabs in the Autopilot console

## Goal
Add a **System Tests** surface to the Autopilot console (`AutopilotConsole.jsx`)
with **one sub-tab per loop-mode test I've made**, so testing the autopilot is a
first-class thing you do *in the dashboard* instead of running CLI scripts by hand.

## The tests that exist today (one sub-tab each)
All live in `.claudeweb-preview/playwright/`, all target an **isolated** harness at
`http://localhost:5210` (NOT live `:5099`):

| Sub-tab | File | What it checks | Runtime |
|---------|------|----------------|---------|
| API contract | `verify-loopmode-api.mjs` | `POST /api/autopilot/loop` start/update/stop + state in `GET /api/autopilot`, against a **fake repoId** (no real agent driven) | pure `fetch`, no browser |
| UI states | `verify-loopmode-ui.mjs` | Loops tab arm/live/finished states + correct POST bodies (stubs `/api/autopilot`) | **Playwright Chromium** |
| SPA honesty | `verify-loopmode-spa.mjs` | `understanding-app/` SPA matches the build | **Playwright Chromium** |
| Probe | `probe-loopmode.mjs` | ad-hoc page probe + screenshot (not a clean assert) | **Playwright Chromium** |

## Key constraint (surfaced before building)
These are external Node/Playwright scripts bound to `:5210`. A Run button in the
live harness can't run them in-process — it must **shell out to `node`**, which
needs Playwright installed and an isolated `:5210` harness already running. When
that's absent the tab must show **"prerequisite missing"**, never a fake pass
(honesty: a broken thing is visibly broken).

## Plan (pending your pick on the fork below)
- **Backend:** gated `SystemTestsController` — `GET /api/autopilot/systests`
  (list + last result) and `POST /api/autopilot/systests/{id}/run` (spawn
  `node <script>`, capture stdout/stderr/exit, detect prereqs). Behind the
  **AutopilotGate** like every other autopilot endpoint.
- **Frontend:** new **System Tests** top-level tab in `AutopilotConsole`, with a
  nested sub-tab per test: title, what-it-checks, file path, prereq status, **Run**
  button, streamed output pane, pass/fail badge, last-run time, and (browser tests)
  the screenshot artifact rendered inline.
- **Verify** on an isolated port + honesty pass on `understanding-app/`.

## Open fork (need your call)
What does each sub-tab's **Run** actually do?
- **A — Real runner (shell out):** server spawns the `.mjs` and streams results.
  Honors "one runnable sub-tab per existing test," but needs node+Playwright+`:5210`
  and is an ouroboros (live harness driving a browser against an isolated one).
- **B — Viewer only:** sub-tab shows the test + its last screenshot/result artifact
  + a copy-the-command-to-run-on-host button. Lighter, fully honest, but not
  one-click from the dashboard.

## Assumptions
- Scope = **loop-mode tests only** (the classifier brain is still a keyword stub).
- New tab is **Advanced-gated**, consistent with the rest of Autopilot.
