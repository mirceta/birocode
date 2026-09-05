# Design — the Management App

## D1. One source tree, two builds

The harness client and the Management App share `client/src`. A second Vite
config (`vite.manage.config.js`, entry `manage.html`, `base: './'`) emits into
`events-app/manage/`. The Arch page and Ideas panel are imported as-is; only the
providers they need are mounted (Language, UiMode pinned to advanced, Dock, a
MemoryRouter for `useNavigate`). This is the "lift" phase 1 promised: nothing in
those components changes.

Rejected: porting the Arch UI to vanilla JS inside the events page (a rewrite of
~1,500 lines with no shared code), and pointing the events page at the harness's
main bundle (its router and layout assume the studio shell).

## D2. Served by the harness, updated by refresh

`events-app/` is already a build-less static folder the harness serves from the
repo worktree (`HarnessStaticApp.Serve`, no-store, sub-paths, explicit 404).
`events-app/manage/` rides the same route. Rebuilding the bundle and refreshing
the page is the whole update cycle. The bundle is committed, so every peer that
pulls the repo has the app without a build step on that box.

## D3. One home harness, REST only

The app derives its API root from its own URL (`<prefix>/api/`) exactly like the
events page, so `/api/arch`, `/api/notes`, `/api/collector` resolve to the
harness that serves it. Same origin → the session cookie is the credential; the
app stores nothing and never embeds a password. Fleet reach is the harness's job
(collector pulls, peer API, ideas hub) — the app never calls a second harness.

## D4. Tabs and addressing

`?tab=arch|ideas|events` wins, else the device's last tab, else Arch. "Open
harness" and the Arch page's "open dock" go to `<root>/studio` in the top window
(the app may be embedded in the Local tab or the dashboard).

## D5. Advanced by definition

Management is an Advanced-mode surface. The app pins the UI mode to advanced in
device storage before rendering so feature-gated components render; the harness
UI's own mode is unaffected in practice (same key, same value it would need
anyway to reach the Management dashboard view).

## D6. The harness Management view (optional here)

Once the app is proven on live, the dashboard's Management layer may render an
embed of `/api/localview/<self>/app/events-feed/manage/?tab=arch` instead of
mounting the components — one implementation, two doors. Kept as an optional
task so phase 2 ships even if the embed needs its own iteration.
