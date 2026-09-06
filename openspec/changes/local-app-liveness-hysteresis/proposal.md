# Proposal: local-app-liveness-hysteresis — an embedded local app is hidden only when the harness knows it is dead

## Why

Board task d1ce7236: in a repo agent's dock (and the Local tab) a registered local app
renders for ~2–3 s, then flips to "Nothing is running yet"; re-clicking re-renders it,
and it flips again. The app is fine. The frame's liveness was ONE `fetch` of the app
root every 4 s with a **3 s abort**, and a **single** non-OK or aborted sample flipped
the view and unregistered the kept-alive iframe (`ProductFrame.jsx`). Anything that
delays one probe past 3 s — a request queued behind the page's other traffic (git
status/branches/graph calls of 5–9 s were measured on the live wall; the browser allows
~6 connections per plain-HTTP origin), a slow first byte through the remote proxy — or
an app answering the probe with any non-2xx, hid a live app. The re-click showed it
again instantly because the frame host keeps the iframe, and the next single-sample
verdict hid it again: the exact ~3 s flap.

## What

1. **Only the harness's own verdict means down.** The localview proxy stamps its own
   answers with `X-ClaudeWeb-Localview: unreachable` (the 502 it writes when the port
   refused) and `no-app` (its 404s). The probe treats only those as down; any status the
   app itself produced means the app is up.
2. **A timed-out probe says nothing.** The abort is 8 s (was 3) and an abort or a
   same-origin send failure is "unknown": the view keeps its last state.
3. **Hysteresis.** A live app is hidden only after three consecutive down verdicts
   spanning at least ten seconds since the last good sample; one good sample restores
   it at once. An app never seen up still shows the empty state on the first down (a
   dead port is reported immediately, as before). Probes never overlap.
4. **Regression tests.** `liveness.test.mjs` (node:test) pins the policy — its first
   test fails on the old single-sample rule. An isolated Playwright check drives the
   Local tab with 5 s probes and injected harness-down verdicts: the app renders, stays
   through two downs, hides only under a sustained outage (≥ 10 s), and comes back.

## Out of scope

The connection budget itself (openspec reduce-connection-appetite) and the git-status
latency that fills it; the probe still runs every 4 s.
