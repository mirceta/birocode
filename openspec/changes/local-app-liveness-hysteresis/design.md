# Design: local-app-liveness-hysteresis

## D1 — The policy is a pure module

`client/src/components/app/liveness.js`: `classify({res, error, sameOrigin})` → `up |
down | unknown`; `next(state, sample, now)` → `{online, misses, lastUp}`; constants
`PROBE_INTERVAL_MS 4000`, `PROBE_TIMEOUT_MS 8000`, `OFFLINE_AFTER_MISSES 3`,
`OFFLINE_AFTER_MS 10000`. `ProductFrame` keeps the state in a ref, calls `next` per
sample and sets `online` only when the verdict changes, so a probe never re-renders the
frame for nothing. A pending probe blocks the next tick (`probingRef`).

## D2 — Down is the harness's word, not the app's

`LocalProxyController` sets `X-ClaudeWeb-Localview` on the responses it authors: `no-app`
on both 404s, `unreachable` on the 502 written when the loopback dial threw. Everything
proxied from the app passes through unstamped. `classify` reads the header; a 502 the
app itself produced (a dev server's own upstream error) is therefore "up" — the app
answered. Cross-origin (no-cors) probes stay opaque: any answer is up, a refused
connection is down.

## D3 — What still hides an app

A dead port: the proxy's 502 on the first probe of an app never seen up → empty state at
once (unchanged). A sustained outage: three consecutive proxy downs over ≥ 10 s → the
frame is unregistered and the empty state shows; the next good probe brings it back and
the kept-alive iframe re-projects instantly.
