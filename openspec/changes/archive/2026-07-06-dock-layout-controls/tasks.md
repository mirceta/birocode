## 1. Zero top chrome

- [x] 1.1 Layout.jsx: add `app-content--dash` modifier to the overlay's
      `<main>`; global.css: `.app-content--dash { padding: 0 6px 8px; }`
      (BottomNav is hidden while the dashboard is open)
- [x] 1.2 dashboard.css: `.dash` padding → 0; keep the docktoolbar's 2px
      scrollbar padding; `.dash__header` margin-bottom 6px → 4px

## 2. Layout state + grid

- [x] 2.1 Dashboard.jsx: replace SIZE_STEPS/`claudeweb_dash_size` with
      `claudeweb_dash_grid` JSON state `{cards:{cols,h}, phones:{cols,h}}`
      (0 = auto; phones bucket covers phones+hot), read/clamp/persist helpers
- [x] 2.2 Dashboard.jsx: grid template — auto cols keep `⌈√n⌉` + 340/460 caps;
      explicit cols → `repeat(n, minmax(0,1fr))`; explicit height → inline
      `--dash-cell-h` + `dash__grid--fixed-h` class
- [x] 2.3 dashboard.css: `.dash__grid--fixed-h` overrides — cells take
      `height: var(--dash-cell-h)`, `aspect-ratio: auto`, `min-height: 0`,
      `overflow: hidden` backstop (cards, phone cells, wide, group members)

## 3. Layout popover

- [x] 3.1 Dashboard.jsx: `▤` trigger replaces the −/+ and A−/A+ groups;
      popover with per-row segmented (Auto·1–6), height (Auto + slider
      240–1500 step 20), zoom slider (0.5–2 step 0.1, existing key); Esc +
      outside-click close
- [x] 3.2 dashboard.css: popover + control styles (compact, anchored to the
      header bar, above the grid z-order)
- [x] 3.3 i18n: new keys (layout, perRow, perRowAuto, height, heightAuto,
      zoom label); retire sizeSmaller/sizeBigger in both languages

## 4. Minimal dock spacing

- [x] 4.1 dashboard.css: grid gap 20 → 8px, `.dash__body` gap 20 → 10px,
      `.dash-cell` padding 28 → 12px + gap 10 → 8px, `.dash__group`
      padding 10 → 6px
- [x] 4.2 dashboard.css: phone internals — `.phone__bar`, `.phone__lanes`,
      `.phone__apps`, `.phone__git`, `.chat--embedded .chat__scroll`
      paddings trimmed ~2–4px per side

## 5. Verify

- [x] 5.1 Build client/dist; run isolated preview with seeded dock roster
      (`verify-dock-layout.mjs`, own port + fresh CLAUDEWEB_DATADIR, own dock
      tabs per dock-test-isolation rules)
- [x] 5.2 Playwright: docks bar top edge flush under the status strip (no top
      padding); popover opens/closes (outside click + Esc); explicit 2-per-row
      → 2 equal full-width columns; explicit height applies to every cell;
      Auto restores both; settings persist across reload; cards vs phones
      buckets independent; zoom slider still scales phone content; screenshots
- [x] 5.3 `openspec validate dock-layout-controls --strict`
