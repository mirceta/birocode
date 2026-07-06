# Tasks — add-header-status-strip

## 1. Strip component

- [x] 1.1 Create `client/src/components/header/HeaderStatusStrip.jsx`: strip-level
      collapse state from localStorage key `claudeweb_header_strip_collapsed`
      (default collapsed), `aria-expanded` toggle button + chevron per the existing
      idiom; expanded body mounts `Scoreboard`, `AccountChips` (behind
      `useFeature('accountChips')`) and `HostClock` (behind `useFeature('hostClock')`);
      collapsed renders only the slim summary bar (sections unmounted → no polling)
- [x] 1.2 Create `client/src/components/header/headerStrip.css`: full-width bar under
      the header + `.header-strip__row` (flex, wrap, gap 12px, Scoreboard
      `flex: 1 1 320px`), collapsed slim-bar styling
- [x] 1.3 Add `headerStatusStrip: 'advanced'` to the FEATURES map in
      `client/src/context/UiModeContext.jsx` and gate the strip with it
- [x] 1.4 Add i18n keys (`headerStrip.title` / `expand` / `collapse` / summary) to
      `client/src/i18n/en.json` and `tr.json`

## 2. Mount + remove from dashboard

- [x] 2.1 Mount `<HeaderStatusStrip />` in `StudioShell` (`client/src/layout/Layout.jsx`)
      directly after `</header>`, above the dashboard/panes/outlet branch so it shows
      on every screen including the open dashboard overlay
- [x] 2.2 Remove the `.dash__scoreboard-row` block and its `accountChips`/`hostClock`
      `useFeature` reads + imports from `client/src/pages/Dashboard.jsx`; drop the
      now-unused `.dash__scoreboard-row` rule from `client/src/pages/dashboard.css`
      and check dashboard top spacing

## 3. Verify

- [x] 3.1 `npm --prefix client run build`; run the harness from an isolated build on a
      side port (self-dev rules) and verify with Playwright: strip collapsed by default
      below the header, expand→sections render, persistence across reload, present
      while dashboard overlay is open, dashboard row gone, Basic mode shows no strip
- [x] 3.2 Confirm no polling while collapsed (no `/api/analytics`, account, usage or
      host-time requests from the strip) and polling starts on expand
- [x] 3.3 Update any Playwright scripts that assert the scoreboard row inside the
      Dashboard; `openspec validate add-header-status-strip --strict`
