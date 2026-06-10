# Screen Tab — view the host desktop from the phone

> **Status (2026-06-10):** Deployed to the live :5099 harness and confirmed
> by the End User (second attempt; the first deploy auto-rolled back when
> the 7-minute confirmation window lapsed). Browser-verified beforehand on
> an isolated preview instance on :5201
> (`.claudeweb-preview/playwright/verify-screen-tab.mjs`, 9/9 checks).

## Problem

When Claude builds a Windows desktop Product (WinForms etc.), the End User on
the phone has no way to see what was actually made — the App tab only iframes
web Products on the Preview Port. The Operator's monitor is out of reach.

## Decision (user)

Snapshot-based Screen tab with auto-refresh (~0.5 fps), **not** an MJPEG
livestream. Livestream was considered and parked: capture code is shared, but
the stream endpoint needs non-header auth (img tags can't send
X-Auth-Password) and unbuffered passthrough on the off-box /preview/ proxy.
If snapshots feel clunky, the stream can be layered on later on this base.

Read-only: view only, no remote input.

## Scope

Backend (Harness runs in the interactive desktop session, so it can capture):

- `ScreenService`
  - `ListWindows()` — EnumWindows, visible top-level windows with non-empty
    titles → `[{ hwnd, title }]`
  - `Capture(hwnd?)` — whole virtual desktop via `Graphics.CopyFromScreen`,
    or a single window via `PrintWindow` (PW_RENDERFULLCONTENT) → JPEG bytes
- `ScreenController`
  - `GET /api/screen/windows` — window list
  - `GET /api/screen?hwnd=N` — JPEG snapshot (whole desktop when no hwnd)
  - Standard header auth: the frontend fetches as a blob with X-Auth-Password,
    so no img-tag auth workaround is needed.

Frontend:

- `pages/Screen.jsx` — source picker (Desktop / window list), snapshot image,
  Refresh button, auto-refresh toggle (2 s interval)
- Route `/studio/screen`, BottomNav tab, `screenTab: 'advanced'` in the
  UiModeContext capability map, `nav.screen` + `screen.*` i18n keys (en/tr)

## Caveats

- Locked or RDP-disconnected host session ⇒ black frames; not fixable.
- Exposes the Operator's desktop to anyone with the web password.
- Advanced mode only (per plans/ui-modes.md default).
