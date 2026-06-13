# Understanding — stale-copy warning banner

## Goal

When the harness has been redeployed but a user's open browser is still running
the **old** cached frontend, show a small, dismissible banner telling them a new
version is available, with a **Reload** button. This is the case that bit us
after the per-tab fix: two windows kept running the pre-fix bundle until a hard
refresh.

## Why a banner (not a cache header)

The user chose the banner over `Cache-Control: no-cache` because it actively
catches a **long-open / idle** session — a single-page app never re-fetches
`index.html` on its own, so a header only helps on a full reload. The banner
polls and notifies. (PWA here is manifest-only, no service worker, so neither
option touches it.)

## How it works

- The build already bakes `__BUILD_TIME__` into the bundle (vite `define`).
- The build also **emits `dist/version.json`** with the *same* build time (one
  shared constant in `vite.config.js`, written by a tiny plugin).
- A small client check fetches `/version.json` (cache-busted, `no-store`) on
  mount, on tab focus / visibility, and on a periodic timer. If the served
  `buildTime` differs from the running `__BUILD_TIME__`, it shows the banner.
- Banner: "A new version is available — Reload" + Reload (`location.reload()`)
  + dismiss. Mirrors the existing Exposure-freshness "embed is current" pattern.

## Decisions / assumptions

- **Visible to ALL users (Basic + Advanced)**, not Advanced-only. CLAUDE.md says
  new UI defaults to Advanced — I'm deviating on purpose because the End User
  (Basic mode) is exactly who got stranded on stale code. Flagging per
  convention; tell me if you want it Advanced-only.
- `version.json` is a **static build artifact** (no backend endpoint needed).
- Frontend-only change (`vite.config.js`, one component + hook, i18n). Same
  deploy ritual.

## Verify

Isolated `:5200` harness + Playwright: stub `/version.json` to a *different*
buildTime → banner appears and Reload works; stub it to the *same* buildTime →
no banner. Plus a real load with the genuinely-matching version → no banner.
