## 1. Indicator restyle (CSS)

- [x] 1.1 In `dashboard.css`, grow `.phone__dot` to a clearly visible indicator (~16–18px, tuned so the `phone__bar` row height doesn't jump) and set its default (at-rest) background to `var(--color-accent)` — covers `idle`
- [x] 1.2 Restyle `.phone--running .phone__dot` to `var(--color-text)` (near-black), keeping the existing `dash-pulse` animation as reinforcement
- [x] 1.3 Change `.phone--done .phone__dot` to the at-rest accent orange (remove the blue), leave `.phone--error .phone__dot` red
- [x] 1.4 Check both themes: confirm the tokens flip correctly under the dark theme so the busy indicator matches the Stop button's dark-mode color — N/A in practice: the app has a single static token set (no dark theme in `global.css`), so the indicator and Stop button share the same tokens by construction

## 2. Verify

- [x] 2.1 `npm --prefix client run build` passes
- [x] 2.2 Browser-check per `docs/claude-web/browser-testing.md`: verified on an isolated :5200 preview with Playwright (`.preview-test/dock-busy-indicator-check.mjs` — ALL PASS): idle → accent orange rgb(201,100,66), running → near-black rgb(43,43,41) with dash-pulse, done → orange, error → red rgb(239,68,68); dot renders 16×16; a busy chat's Stop button computed to the same rgb(43,43,41), confirming the send-button mirror. (Statuses driven via the `phone--<status>` class — the exact input to the CSS under test — rather than burning a live agent turn.)
- [x] 2.3 Eyeball a wall of docks at normal dashboard zoom: busy vs at-rest distinguishable at a glance (the spec's legibility scenario) — see `.preview-test/out-dock-busy/04-wall-one-busy.png`

## 3. Bookkeeping

- [x] 3.1 `openspec validate dock-busy-indicator --strict` passes
