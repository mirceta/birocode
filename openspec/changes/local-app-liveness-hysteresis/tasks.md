## 1. Build

- [x] 1.1 `liveness.js` (pure): classify (harness verdict header = down, any app answer =
      up, timeout/unsendable = unknown), hysteresis (3 misses over ≥ 10 s), constants.
- [x] 1.2 `ProductFrame.jsx`: 8 s abort, no overlapping probes, verdict through the policy,
      `online` set only on change; the optimistic kept-alive seed counts as a good sample.
- [x] 1.3 `LocalProxyController`: `X-ClaudeWeb-Localview: unreachable | no-app` on the
      harness's own 502 / 404 answers.
- [x] 1.4 `npm --prefix client test` runs `liveness.test.mjs`.

## 2. Verify

- [x] 2.1 Reproduced on live (`repro-local-app-flap.mjs`, `probe-local-app-fetch.mjs`): in a
      healthy headless browser the probe answers in 2–20 ms and the app stays up; the same
      page carries git calls of 5–9 s that fill the per-origin connection budget — the
      condition under which the old 3 s single-sample probe aborts and hides the app.
- [x] 2.2 `liveness.test.mjs` (8): the single-down regression, the 3-miss/10 s rule, reset on
      up, unknown changes nothing, never-up goes down at once, verdict classification,
      timeouts unknown, optimistic seed.
- [x] 2.3 Isolated instance (`local-app-flap-e2e.ps1` → `check-local-app-flap.mjs`): proxy
      headers on 404/502; Local tab Understanding app renders with 5 s probes; stays through
      two harness-down verdicts; hides only under a sustained outage (≥ 10 s); returns on
      the next good probe; no page errors.
- [ ] 2.4 Live after deploy: open a registered app in a dock; it stays rendered past 3 s.

## 3. Ship

- [ ] 3.1 PR against main (board task d1ce7236); the Operator merges and deploys.
