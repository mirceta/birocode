# Design — header status strip

## Context

The four status sections live today as three self-polling components rendered in
`Dashboard.jsx` (~line 1130) inside `.dash__scoreboard-row` (dashboard.css ~1746):

- `Scoreboard` (`components/dashboard/Scoreboard.jsx`) — `GET /api/analytics` every 5 s
- `AccountChips` (`components/dashboard/AccountChips.jsx`) — the GitHub chip
  (`/api/github-account`) and the Claude chip (`/api/claude-account` + `/api/claude-usage`),
  plus `GitHubTokenControl` behind `useFeature('githubTokenControl')`
- `HostClock` (`components/dashboard/HostClock.jsx`) — `GET /api/host-time` + 1 s ticker

Each already carries its own localStorage-backed collapse (`claudeweb_scoreboard_collapsed`,
`claudeweb_github_account_collapsed`, `claudeweb_claude_account_collapsed`,
`claudeweb_host_clock_collapsed`) with the shared idiom: `aria-expanded` header button +
chevron, body rendered only when expanded. None of them share React context for data —
they are fully portable.

The app header is `StudioShell` in `client/src/layout/Layout.jsx` (~lines 133-142):
`<header className="app-header">` (sticky, `z-index: 20`, `--header-height`, styles in
`styles/global.css` ~95). Directly below it the shell branches: Dashboard overlay OR
PaneStrip OR `<main className="app-content"><Outlet/></main>`, then `BottomNav`.

## Goals / Non-Goals

**Goals:**
- Status strip visible on every studio screen, directly under `.app-header`, full width.
- Collapsed by default; expand/collapse persists per device.
- Move — not copy — the four sections out of the Dashboard.
- No new API traffic while collapsed.

**Non-Goals:**
- No backend or endpoint changes.
- No redesign of the sections' internals (Scoreboard windows, chip layout, clock skew
  logic stay untouched).
- No change to the Dashboard overlay's other panels (Ideas, Autopilot, agent grid).
- Basic-mode exposure (pending user answer; ships Advanced-gated).

## Decisions

1. **New `HeaderStatusStrip` component in `client/src/components/header/`**, mounted in
   `StudioShell` immediately after `</header>`, before the content branch. Rendering it
   in the shell (not per-route) is what makes it "always shown", including while the
   Dashboard overlay is open. *Alternative rejected:* putting it inside `.app-header`
   itself — the header is sticky with a fixed `--header-height`; a second row would
   break that contract, so the strip is its own sibling element (it can be sticky later
   if asked; default is non-sticky so it scrolls away with content).

2. **One strip-level collapse, keys stay per-section.** The strip owns a single
   `claudeweb_header_strip_collapsed` localStorage flag (default `'1'` = collapsed) using
   the exact idiom the sections already use (state initializer reads the key, toggle
   writes `'1'`/`'0'`, header button with `aria-expanded` + chevron). The sections keep
   their own inner collapse keys unchanged — nested collapse is already how these
   components behave and costs nothing. *Alternative rejected:* a generic shared
   `<Collapsible>` component — net-new abstraction the codebase deliberately doesn't
   have; follow the existing idiom instead.

3. **Mount-gated polling.** When collapsed, the strip renders only its slim summary bar
   and does **not** mount the section components — their `useEffect` pollers only exist
   while expanded. This is the same `{!collapsed && (...)}` conditional the sections use
   internally and guarantees zero extra requests in the default state on every screen.
   Trade-off: expanding shows each section's brief "loading" state (~1 poll); acceptable.

4. **Sections move verbatim; Dashboard row deleted.** `Dashboard.jsx` loses the
   `.dash__scoreboard-row` block and its `accountChips`/`hostClock` `useFeature` reads;
   the `HeaderStatusStrip` takes over those two gates unchanged (Scoreboard remains
   ungated inside the strip). The components themselves and their CSS files are not
   edited — only the row wrapper CSS is reproduced as `.header-strip__row` (flex,
   wrap, gap 12px, Scoreboard `flex: 1 1 320px`, full width) in a new
   `components/header/headerStrip.css`.

5. **Capability `headerStatusStrip: 'advanced'`** in `UiModeContext.jsx` gates the whole
   strip, per the ui-modes convention for new UI features. In Basic mode nothing renders
   (no empty bar). Flipping this one key to `'basic'` is the entire "End Users too"
   switch if the user wants it.

6. **i18n:** new keys `headerStrip.title`, `headerStrip.expand`, `headerStrip.collapse`
   (+ a short collapsed summary label) in both `en.json` and `tr.json`.

## Risks / Trade-offs

- [Losing state on collapse] Unmounting sections on collapse resets transient UI state
  (e.g. selected Scoreboard window). → Windows/collapse prefs those components care
  about are already in localStorage; acceptable.
- [Sticky-header interplay] `.app-header` is sticky; the strip below it is not, so an
  expanded strip scrolls away. → Intended for v1; a `position: sticky; top:
  var(--header-height)` variant is a one-line follow-up if the user wants it pinned.
- [Dashboard regression] Tests / muscle memory expect the scoreboard row inside the
  Dashboard. → Update the affected Playwright scripts; the Dashboard keeps its toolbar
  and grid layout, only the top row disappears (spacing check needed).
- [Phone width] Four sections in one row won't fit on phones. → `.header-strip__row`
  wraps (same `flex-wrap: wrap` behavior the dashboard row had); collapsed-by-default
  hides the problem in the common case.

## Migration Plan

Pure frontend move, ships with the normal build; no data migration. Old per-section
localStorage keys keep working. Rollback = revert the commit.

## Open Questions

- Should Basic mode (End Users) see the strip? The request said "always-shown" but was
  truncated; shipping Advanced-only per convention until answered.
- Should the strip be sticky (pinned under the header when scrolling)? Default: no.
