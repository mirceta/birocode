# Kill stale-cache "the fix didn't ship" for good

## What you asked
A button in the app that refreshes stale cached data, because you hit "the
deploy looks like it didn't work, but it actually did — my browser was stale"
**extremely often**.

## What's actually wrong
- The harness SPA `index.html` is served with **no `Cache-Control`** (only
  ETag/Last-Modified) — `EmbeddedApi.cs` `ConfigureStaticFiles` + the SPA
  fallback. A cacheable `index.html` is the problem: it pins *specific* hashed
  asset filenames, so a stale `index.html` loads stale JS.
- There's already a `StaleVersionBanner` that detects a new build and offers
  **Reload**, but Reload = `location.reload()`, which can re-serve the *cached*
  `index.html` → still stale. So the existing safety net leaks.

## What I'll do
1. **Root cause (server):** in `EmbeddedApi.cs`, serve `index.html` and
   `version.json` `no-store`, and serve the content-hashed `/assets/*`
   `immutable, max-age=1y`. Now any reload is guaranteed to fetch fresh
   `index.html` → fresh asset hashes → fresh app. This is the actual cure.
2. **The button you asked for (client):** a **Force refresh** control that does a
   *thorough* clear — delete all Cache Storage entries, unregister any service
   workers, then hard-reload with a cache-bust. On-demand escape hatch, always
   reachable (Settings).
3. **Make the existing banner reliable:** its Reload reuses the same thorough
   clear instead of a plain reload.

## Assumptions / notes
- **Convention deviation (flagged):** CLAUDE.md says new UI defaults to Advanced
  mode. Like the StaleVersionBanner, this control is exactly what the End User
  (Basic) needs, so I'll make it visible in **both** modes — deliberate, same
  rationale as the banner.
- Build + verify on an isolated port first; deploy to `:5099` only on your say.
