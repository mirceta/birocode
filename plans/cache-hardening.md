# Stop stale code: no-store shell + a Force-refresh button

> **Status (2026-06-17):** Built on `feature/ideas-active-section`, verified on
> an isolated `:5210` harness; **not yet deployed**. Extends
> [stale-version-banner](plans/stale-version-banner.md), which detected the
> problem but couldn't reliably cure it.

## Problem

The user hits "I deployed, but my browser still shows the old version"
**extremely often**. Root cause: the harness SPA `index.html` was served with
**no `Cache-Control`** (`EmbeddedApi.cs`, default `UseStaticFiles` + the SPA
fallback). A single-page app never re-fetches `index.html`, and a cacheable
shell pins **specific content-hashed** asset filenames — so a stale `index.html`
(held by the browser or the off-box IIS+ARR proxy) keeps loading yesterday's JS.

The existing `StaleVersionBanner` detects a new build, but its **Reload** was a
plain `location.reload()`, which can re-serve the *cached* `index.html` → still
stale. The safety net leaked.

## Design — three layers

1. **Server (root cause).** `EmbeddedApi.SetSpaCacheHeaders`, wired into both
   `UseStaticFiles` and the `MapFallbackToFile`:
   - `index.html` + `version.json` → `no-store, no-cache, must-revalidate`.
   - `/assets/*` (content-hashed) → `public, max-age=31536000, immutable`.
   So every reload revalidates the shell → fresh hashes; immutable assets still
   cache for a year. This is the actual cure.
2. **Force refresh button (the ask).** `client/src/lib/hardRefresh.js`: delete
   every Cache Storage entry, unregister any service workers, then navigate to a
   cache-busted URL (`?_fresh=<ts>`). Surfaced in **Settings ▸ Maintenance**
   (`Settings.jsx`) next to a read-only "this tab's build" stamp.
3. **Banner reuses it.** `StaleVersionBanner`'s Reload now calls `hardRefresh()`
   instead of a plain reload.

## Visibility (convention deviation, deliberate)

CLAUDE.md defaults new UI to Advanced. The Force-refresh control is visible in
**both** modes — same rationale as the StaleVersionBanner: the End User (Basic)
is exactly who gets stranded on stale code. Settings is non-hideable, so it's a
global maintenance control, not a capability gate.

## Files touched

| File | Change |
|------|--------|
| `ClaudeWeb.App/Services/Hosting/EmbeddedApi.cs` | `SetSpaCacheHeaders` on static + fallback. |
| `client/src/lib/hardRefresh.js` | New thorough cache-clearing reload. |
| `client/src/pages/Settings.jsx` (+ `settings.css`) | Maintenance section: button + build stamp. |
| `client/src/components/shared/StaleVersionBanner.jsx` | Reload → `hardRefresh()`. |
| `client/src/i18n/en.json`, `tr.json` | `settings.maintenance` / `forceRefresh` / hint / `buildVersion`. |

## Verification

Isolated `:5210` harness:
- Headers (`curl`): `index.html`, `version.json`, and the SPA fallback all
  `no-store`; `/assets/*` `immutable`.
- UI (`.claudeweb-preview/playwright/verify-force-refresh.mjs`): button present,
  build stamp shown, click → cache-busted URL + clean re-render, no console
  errors.
