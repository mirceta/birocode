# Tasks

## 0. Layout fix — full-span tab must enter multi-pane (the primary bug)

- [x] 0.1 `client/src/layout/PaneStrip.jsx` — when the active tab's span consumes
      the whole budget (`lo === hi`) and it was intentionally widened
      (`weight > 1`), return `multi: true` with a lone pane instead of
      `multi: false`. Otherwise it falls back to the `.app-frame` single view
      capped at `--max-width: 720px` and centered — the actual gutter bug.
- [x] 0.2 `PaneStrip.jsx` — gate the span ± steppers on `panes.length > 1` so the
      lone full-span pane shows none (preserves the multi-pane spec; shrink via
      the Settings tab).

## 1. Implement the fill-on-wide CSS (complementary: very wide panes > a page cap)

- [x] 1.1 `client/src/pages/cockpit.css` — add `@container (min-width: 1200px) { .ck { max-width: none; } }`
      beside the `.ck` cap, so a pane wider than the cockpit reading cap fills.
- [x] 1.2 `client/src/pages/settings.css` — add `@container (min-width: 560px) { .settings-page { max-width: none; } }`
      beside the `.settings-page` cap.
- [x] 1.3 `client/src/pages/terminal.css` — add `@container (min-width: 1100px) { .terminal-page { max-width: none; } }`
      beside the `.terminal-page` cap.
- [x] 1.4 Confirmed no other page root combines `max-width` + `margin: 0 auto`
      (grep) and that `dashboard.css`'s `margin: auto` (`.evc__empty`) is correctly
      excluded as a non-root inner element.

## 2. Verify

- [x] 2.1 `npm --prefix client run build` compiles clean (no CSS/JS errors).
- [ ] 2.2 Live check (Advanced UI, multi-pane, per `docs/claude-web/browser-testing.md`):
      give a tab enough span to fill the strip → content fills, no side gutters;
      drop it back to span 1 → reading width unchanged. Repeat on Cockpit,
      Settings, Terminal. (Needs a host eyeball / headless browser.)

## 3. Ship

- [x] 3.1 `openspec validate tab-fill-available-width --strict` passes.
- [ ] 3.2 Merge `feature/tab-fill-available-width` → `main`.
- [ ] 3.3 `openspec archive tab-fill-available-width` — fold the delta into the
      `multi-pane` baseline.
