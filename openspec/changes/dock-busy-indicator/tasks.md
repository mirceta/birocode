## 1. Indicator restyle (CSS)

- [ ] 1.1 In `dashboard.css`, grow `.phone__dot` to a clearly visible indicator (~16–18px, tuned so the `phone__bar` row height doesn't jump) and set its default (at-rest) background to `var(--color-accent)` — covers `idle`
- [ ] 1.2 Restyle `.phone--running .phone__dot` to `var(--color-text)` (near-black), keeping the existing `dash-pulse` animation as reinforcement
- [ ] 1.3 Change `.phone--done .phone__dot` to the at-rest accent orange (remove the blue), leave `.phone--error .phone__dot` red
- [ ] 1.4 Check both themes: confirm the tokens flip correctly under the dark theme so the busy indicator matches the Stop button's dark-mode color

## 2. Verify

- [ ] 2.1 `npm --prefix client run build` passes
- [ ] 2.2 Browser-check per `docs/claude-web/browser-testing.md`: on the dashboard, an idle dock shows the orange indicator, sending a message flips it to black for the duration of the turn, and it returns to orange on done; an error dock shows red
- [ ] 2.3 Eyeball a wall of docks at normal dashboard zoom: busy vs at-rest distinguishable at a glance (the spec's legibility scenario)

## 3. Bookkeeping

- [ ] 3.1 `openspec validate dock-busy-indicator --strict` passes
