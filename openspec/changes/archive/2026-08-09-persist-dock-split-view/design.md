# persist-dock-split-view — design

## Context

A dock's local-app view is composed of three pieces of state, all `useState` local
to `PinnedAgent.jsx`:

- `openAppId` (PinnedAgent.jsx:79) — which discovered local app is open in the dock
- `splitApp` (PinnedAgent.jsx:88) — split presentation on/off (openspec dock-app-split-view)
- `splitRatio` (PinnedAgent.jsx:97) — chat-pane percent for the divider (openspec split-divider-drag)

Hiding a dock from the dashboard grid (dock toolbar strip, or the "show only
important" filter) unmounts the `PinnedAgent` — by design: "hidden means
unmounted (no fetches, not a layout citizen)" (Dashboard.jsx:108). Unmount wipes
the three states, so re-show always lands on plain chat.

Meanwhile the app's *frame* survives: kept-alive frames live in
`LocalAppFramesContext` above the dock (openspec local-app-state-preserve), keyed
`dock:<tabId>:<repoId>:<appId>`, and are only released when the dock leaves the
roster, the repo changes, or the cap evicts them. So today we keep the expensive
state (the running app document) and lose the cheap pointer (three scalars).

The dock-hidden set itself is already remembered per device in localStorage; the
grid layout and panel choices follow the same pattern.

## Goals / Non-Goals

**Goals:**
- Re-showing a hidden dock restores its local-app view: same app, same
  presentation (cover/split), same divider ratio — zero re-setup clicks.
- Restore is guarded: a remembered app that no longer exists degrades to plain
  chat and the stale memory is dropped.
- Same device-local scope as the rest of the dashboard view state.

**Non-Goals:**
- No cross-device or backend persistence (ratio is viewport-dependent; view
  state is a device concern — matches dock-hidden/layout precedent).
- No change to frame keep-alive semantics (`local-app-frame-persistence` is
  untouched; after a page reload the view state restores but the app document
  loads fresh, as frames are in-memory only).
- No new visible affordances; no i18n; no change while the dock stays mounted.
- Files/console/openspec view choices stay ephemeral (out of scope).

## Decisions

**D1 — Device-local localStorage, per dock id.** One key per dock,
`claudeweb_dock_appview:<dockId>`, holding `{ appId, split, ratio }`. Follows the
established device-local pattern (dock-hidden set, grid layout, UI mode).
*Alternative rejected:* a backend `DockTab` field — adds API/model churn, syncs a
viewport-dependent ratio across devices where it makes no sense, and outlives its
usefulness (frames are per-device anyway).

**D2 — Write-through on change, lazy-init on mount.** Each state change (open/
close app, split toggle, ratio commit) writes the record; `useState` initializers
read it once on mount. Ratio writes happen on drag end / double-click reset, not
per pointer-move. Explicitly closing the app (or opening files/console, which
closes it today) writes `appId: null` — an explicit user choice is remembered as
such; hide/re-show is the only path that restores.

**D3 — Guarded rehydration against the async apps list.** The discovered-apps
list arrives async after mount, so `openAppId` is restored optimistically but
`openApp` stays null (chat shows) until the list contains the remembered id — the
existing `apps.find(...)` derivation already gives this for free. Once the list
has loaded, a remembered id that is absent is treated as vanished: the stored
record is cleared and the dock stays on chat. Ratio is clamped to the existing
[20, 80] band on read; `split` only takes effect while an app is open and the
`dockAppSplit` Advanced gate is on (Basic mode degrades to cover per the existing
gate rules, without erasing the stored choice).

**D4 — Spec shape: one ADDED requirement + two MODIFIED.** The restore behavior
is a new `agent-dock` requirement ("view state survives hide and re-show"); the
existing "ephemeral" clauses in "Side-by-side view mode…" and "Adjustable split
ratio…" are MODIFIED to device-local persistence so the baseline doesn't
contradict itself. Persistence via localStorage also survives page reload — the
spec upgrades "MAY reset on reload" accordingly (frame content still reloads
fresh; only the view state is restored).

## Risks / Trade-offs

- [Stale records accumulate for deleted docks] → keys are tiny; clear the record
  when a dock is removed from the roster is *not* wired (no reliable unmount-vs-
  hide signal in the component) — accepted, same as other per-dock device keys.
- [Ratio restored on a much narrower viewport] → existing clamp floors
  (min(px, %) CSS + drag clamp) already handle undersized panes; ratio is also
  re-clamped on read.
- [Restoring split flashes chat first while apps load] → acceptable: chat is the
  correct degraded view until the app list confirms the app still exists.
- [Two tabs on the same device write the same key] → last-writer-wins is fine
  for view state; no coordination needed.

## Open Questions

(none)
