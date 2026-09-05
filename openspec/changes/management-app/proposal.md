# The Management App — the management layer as a refresh-to-update static app

## Why

Phase 1 (openspec split-management-dashboard, live 2026-09-05) put the Arch agent
and Ideas into a Management view inside the harness. Every change to that view
still costs a harness build, swap, dead-man switch and restart. The events app
proves the alternative: a build-less static folder the harness serves from the
repo worktree, no-store, same origin — change a file, refresh, done. The
operator wants the whole management layer to live that way, separate from the
execution machinery it steers.

## What changes

1. **A second Vite build of the same React source** (`client/manage.html` →
   `events-app/manage/`) becomes the **Management App**: three tabs — **Arch**
   (the harness's own Arch page, lifted unchanged), **Ideas** (the Ideas panel,
   unchanged), **Events** (the existing vanilla feed page embedded as-is). It is
   served by the harness at `/api/localview/<repo>/app/events-feed/manage/`,
   derives its API root from its own path (like the events page), and uses the
   harness session cookie as its only credential. `npm --prefix client run
   build:manage` + refresh updates it; no harness redeploy.
2. The events feed page gets a **Manage ↗** link in its tab bar.
3. Backends do not move. The Arch backend, Ideas store and collector stay in the
   harness; the app speaks REST to its ONE home harness; fleet reach comes from
   the harness's server-side relays (collector pulls, peer API, ideas hub).
4. The harness's Management dashboard view stays as the in-harness twin for now
   (task 4, optional in this change): it may embed the Management App instead of
   mounting the components directly, once the app is proven on live.

## What does NOT change

The 2026-09-02 decision: the arch agent is hosted in the harness. The Execution
dashboard, docks, loops, audit. The events page itself (only a link is added).

## Impact

`client/manage.html`, `client/src/manage/*`, `client/vite.manage.config.js`,
`client/package.json`, `events-app/manage/**` (committed build output, so a peer
gets the app by git pull), `events-app/index.html`, i18n; specs: new capability
`management-app` (ADDED), `harness-event-feed` (MODIFIED: the feed page links to
the app).
