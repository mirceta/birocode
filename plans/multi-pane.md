# Multi-pane desktop layout

> **Status (2026-06-11):** In progress on branch `feature/multi-pane`.

## Why

On a phone the studio shows one tab at a time, which is right. On a desktop
monitor the same single 720px column wastes the screen. The End User asked to
see several tabs side by side — Chat next to Files next to Git — when the
window is wide enough.

## Design — a sliding window over the tab list

No free-form pane management. The nav's tab order is the only order, and the
clicked tab is the anchor:

1. Measure the window: `paneCount = clamp(floor(innerWidth / 420px), 1, 4)`.
2. The active route picks the anchor tab; render `paneCount` tabs **centered
   on the anchor**, clamped at the ends of the list
   (`start = clamp(activeIdx - floor((n-1)/2), 0, len - n)`).
3. Each pane is a column: a slim title bar (click = make that tab the anchor)
   over its own scrolling `.app-content`.
4. `paneCount == 1`, Basic mode, or an unmatched route → the exact existing
   single-pane `<Outlet />` behavior. Phones never see any of this.

Multi-pane is **Advanced-only** (`multiPane: 'advanced'` in the capability
map), per the "new features default to Advanced" convention.

## Accepted limitations (v1)

- **Combinations are dictated by tab order** — you can't see two non-adjacent
  tabs together. The lever is choosing the nav order, not pinning panes.
- **Fixed-position overlays** (session picker, modals) still center on the
  viewport, not on their pane. Cosmetic.
- **App-tab iframe reloads** when the pane window slides it in/out of view
  (unmount/remount). Known iframe behavior, fine for v1.
- No per-pane resize handles; equal widths.

## What

- `client/src/context/UiModeContext.jsx` — `multiPane: 'advanced'`.
- `client/src/layout/PaneStrip.jsx` (new) — tab registry (mirrors BottomNav
  order incl. feature gating), `useMultiPane()` hook (pane count from window
  resize + centering), and the strip renderer.
- `client/src/layout/Layout.jsx` — inner `StudioShell` picks strip vs Outlet
  and widens the frame (`app-frame--multi`).
- `client/src/styles/global.css` — `--pane-bar-height`, `.pane-strip`/`.pane`
  styles, `app-frame--multi` overrides (frame + bottom-nav max-width, chat
  height, chat composer un-fixed into its pane).

State already lives above the panes (Chat/Repo/Dock/Save providers wrap the
whole Layout), so pages keep working when mounted side by side — that's why
this is frontend-only with zero backend changes.

## Verification

`.claudeweb-preview/playwright/verify-multi-pane.mjs` on the isolated :5201
preview (logs in via POST /api/auth/login, own dock tab, logs out after):
pane counts at 1400/900/500px widths, centering on nav click, edge clamping,
pane-bar navigation, Basic mode unaffected.
