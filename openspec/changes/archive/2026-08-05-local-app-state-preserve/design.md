# Design: local-app-state-preserve

## Context

The embedded local-app iframe lives in one shared component, `ProductFrame`
(`client/src/components/app/ProductFrame.jsx`), used by two surfaces:

- **Local tab** — `client/src/pages/LocalApp.jsx:216`, rendered as a react-router
  route element (and as a pane element in multi-pane).
- **Agent dock** — `client/src/components/dashboard/PinnedAgent.jsx:766`, rendered
  conditionally over the always-mounted Chat when `openAppId` is set.

Two distinct mechanisms reload the app today:

1. **Unmount** — leaving `/studio/local` (router `Outlet` swap in `Layout.jsx`),
   a `PaneStrip` pane scrolling out of its visible window, or the dock's
   `openApp ? <ProductFrame/> : null` conditional flipping — all destroy the
   iframe DOM node.
2. **`src` reassignment** — switching apps within a surface changes the `url`
   prop on the *same* mounted iframe (`key={reloadKey}` unchanged), which
   navigates the frame.

Hard browser constraint that shapes everything below: **re-parenting an iframe
node in the DOM reloads its document**. So React portals whose target moves, or
any "hand the iframe to the new surface" scheme, cannot work. The iframe must sit
in one stable DOM container for its whole life and only ever be shown/hidden
(`display:none` does *not* unload an iframe) and repositioned via CSS.

## Goals / Non-Goals

**Goals:**
- Navigation (tab switch, dock-view switch, in-surface app switch, pane eviction)
  never reloads an opened local app.
- Per-app, per-surface frame identity; explicit per-frame refresh; bounded lifetime.
- Zoom (PR #22) keeps working and its level survives navigation for free.

**Non-Goals:**
- Persistence across browser reloads or harness restarts.
- Any backend/proxy change; `/api/localview/...` is untouched.
- Preserving frames when their owning context is gone (repo switched, dock
  removed, app deleted).

## Decisions

### D1 — One root-level frame host with slot projection (over per-surface hacks)

A single `LocalAppFrameHost` is mounted once at the app root (in `Layout`, outside
the router `Outlet`). It owns every kept-alive frame in a `position:fixed`
full-viewport container (`pointer-events:none` on the container, `auto` on frame
wrappers). Surfaces stop rendering the iframe themselves; instead they render a
placeholder **slot** `<div>` and register it with the host via context
(`LocalAppFramesContext`): `acquireFrame({ frameKey, url, port, slotRef })` /
`releaseSlot(frameKey)`. The host absolutely positions the frame wrapper over the
visible slot's rect (tracked with `ResizeObserver` + scroll/resize listeners) and
sets `display:none` on frames whose slot is currently unregistered.

*Why not fix each surface locally?* The dock case could be solved with hidden
in-place rendering (PinnedAgent stays mounted across view switches), but the Local
tab is a route — nothing inside it survives the `Outlet` swap — and PaneStrip
evicts panes wholesale. A root host solves all three with one mechanism and one
set of lifecycle rules, instead of three code paths with different semantics.

*Why not portals?* Moving a portal target re-parents the iframe → reload
(constraint above).

### D2 — Frame identity: `surfaceKind:surfaceId:repoId:appId`

- Local tab: `local:<repoId>:<appId>` (the tab is a singleton surface; its repo is
  part of the key so a repo switch naturally orphans old frames).
- Dock: `dock:<dockId>:<repoId>:<appId>`.

Same app in two surfaces = two frames (they can be visible simultaneously in
multi-pane; sharing would also entangle zoom/refresh state). Switching apps within
a surface = the surface just registers its slot under a different `frameKey`; the
old frame's slot unregisters → hidden, new frame created or re-shown. This is what
removes the `src`-reassignment reload: `url` is fixed per frame for its lifetime.

### D3 — `ProductFrame` splits into shell (in surface) and frame (in host)

The surface keeps rendering `ProductFrame` for its liveness probe, empty state, and
chrome, but the `<iframe>` + zoom viewport moves to a host-rendered `HostedFrame`
that reuses the same zoom cluster UI. Zoom level and `reloadKey` become
frame-owned state living in the host (keyed by `frameKey`), which is what makes
them survive navigation. The refresh button (↻) joins the zoom pill cluster in the
frame's corner overlay and bumps that frame's `reloadKey` (iframe `key` change →
intentional fresh document). `LocalApp.jsx`'s toolbar refresh delegates to the
same per-frame action for the visible frame.

### D4 — Lifetime: explicit release + LRU cap of 6

Release triggers (host drops the frame entirely):
- Repo of the Local tab changes → all `local:<oldRepoId>:*` frames released.
- Dock removed from roster / dock tab closed → `dock:<dockId>:*` released.
- App removed from the repo's `localApps` → its frames released.

Hiding a dock from the dashboard grid also unmounts `PinnedAgent`; its slot
unregisters but the frame is *kept* (it's the same "navigate away" gesture as a
view switch). Beyond explicit releases, an LRU cap of **6** frames per client
(least-recently-visible evicted) bounds memory and background activity (timers,
websockets in hidden documents). No persistence: the host's state is plain React
state, gone on page reload.

### D5 — Refresh is available in both UI modes

The Local tab is Basic-visible and its spec already lists "a refresh action" as an
allowed viewing control, so the per-frame refresh shows wherever the frame shows —
no new entry in the `UiModeContext` capability map. Docks are Advanced-gated as a
whole already.

## Risks / Trade-offs

- **[Geometry drift]** Overlay position lags the slot during scroll/animation →
  track with `ResizeObserver` + capture-phase scroll listener +
  `requestAnimationFrame` batching; the Local tab body and dock phone screens are
  mostly static rects, so drift windows are tiny.
- **[Stacking conflicts]** A fixed overlay can float above modals/menus → host
  container gets a z-index *below* the app's modal layer; when a surface is
  covered (modal open), its slot is still registered so no change needed — the
  modal simply draws above.
- **[Hidden-frame resource use]** Hidden documents keep running JS/websockets →
  LRU cap of 6 (D4) plus explicit release rules; refresh gives users a manual
  reset.
- **[Liveness probe interplay]** `ProductFrame` polls the app's port and shows an
  offline state; if a kept-alive frame's app dies while hidden, the shell shows
  the offline state on return while the stale frame is hidden — probe logic stays
  in the surface shell, and the shell only registers its slot when `online`.
- **[Zoom migration]** Zoom state moves from `ProductFrame` local state to
  host-owned per-frame state → straight state hoist; UI unchanged.

## Migration Plan

Frontend-only, additive; ships as one PR. No data or config migration. Rollback =
revert the PR. Verify per `docs/claude-web/browser-testing.md` (headless
Playwright) on the isolated preview before any merge — state preservation is
exactly the kind of claim that needs a real browser, not curl.

## Open Questions

- Cap value 6 is a judgment call — revisit if real usage shows memory pressure or
  users juggling more apps.
- Whether the Understanding app's always-on frame should opt out of the cap
  (never evicted) — leaning yes, it's the convention-bearing surface; decide
  during implementation. **Resolved during implementation:** the Local tab's
  Understanding frame is created with `pinned: true` and skipped by eviction;
  dock copies of the Understanding app are NOT pinned (one per dock would let
  pinned frames crowd out the whole cap). If every frame is visible or pinned,
  the cap is exceeded rather than yanking a live frame from under the user.
