# PWA shell — home-screen icon for Android

> **Status (2026-06-11):** Deployed to the live :5099 harness and confirmed by
> the End User. Browser-verified beforehand on the :5201 preview
> (`.claudeweb-preview/playwright/verify-pwa-shell.mjs`, 8/8 checks).

## Why

The End User wants a launcher icon on their Android home screen that opens
Claude Web like an app, instead of navigating to the address in the browser.
Not a native app — a web app manifest is enough ("Add to Home Screen").

## What

- `client/public/manifest.webmanifest` — name "Claude Web", `display:
  standalone`, `start_url: /studio`, scope `/`, theme/background colors,
  icons 192/512.
- `client/public/icon-192.png`, `icon-512.png` (+ `apple-touch-icon.png`) —
  generated simple "CW" badge.
- `client/index.html` — `<link rel="manifest">`, `theme-color` meta,
  apple-touch-icon link. Vite copies `public/` into `dist/` as-is, so the
  harness serves them like any static file (no auth — only /api/* is gated).

## Caveats

- Over plain HTTP, Android Chrome's "Add to Home Screen" still creates the
  icon, but it opens as a normal browser tab (standalone display and the
  install prompt require HTTPS on the visited origin). Full app-like behavior
  lights up automatically once the upstream proxy serves HTTPS.
- No service worker / offline support — out of scope; the app is useless
  offline anyway.

## Verification

`.claudeweb-preview/playwright/verify-pwa-shell.mjs` on the :5201 preview:
index.html links the manifest, manifest fetches as valid JSON with the
expected fields, both icons return 200 image/png.
