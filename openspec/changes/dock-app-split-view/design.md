# Design: dock-app-split-view

## Context

The dock (`client/src/components/dashboard/PinnedAgent.jsx`, CSS namespace `.phone__*`)
holds the opened app as local state (`openAppId`) and renders it inside
`.phone__screen` above one **always-mounted** `<Chat embedded composerOnly={altViewActive}>`
(the `local-app-overlay-keep-composer` contract: the chat subtree never remounts).
While an app is open, the dock hides its git/discover/understanding chrome via
`!openApp` render conditions so the app gets full height. The app frame itself is a
keep-alive iframe: `ProductFrame` renders only a positioning slot and the real iframe
lives in the root `LocalAppFrameHost`, keyed by `frameKey = dock:<dockId>:<repoId>:<appId>`
(`local-app-state-preserve`); re-parenting the iframe reloads it, so identity + geometry
tracking are what keep state alive. On the dashboard, docks live in a CSS grid
(`Dashboard.jsx`: Auto columns `minmax(0, 460px)`, explicit per-row `1fr`), and a
per-dock `wide` flag already spans a cell across 2 columns (`.dash__cell--wide`).

## Goals / Non-Goals

**Goals:**
- A per-dock split presentation: full normal dock (chat list + composer + chrome) left,
  opened app right — switchable against the existing cover presentation, ephemeral.
- No app reload and no chat remount when toggling cover ↔ split.
- The split dock takes an extra grid column while split, and restores on exit.

**Non-Goals:**
- No persistence of the mode across devices or reloads (same class as maximize-chat).
- No resizable divider between the panes in this change (fixed flex split first).
- No change to the Local tab, multi-pane surfaces, or the app-over-dashboard App tab.
- No backend changes.

## Decisions

- **D1 — Split is dock-local ephemeral state.** `const [splitApp, setSplitApp] = useState(false)`
  in `PinnedAgent`, alongside `openAppId`. Effective split = `splitApp && openApp` —
  closing the app or switching to Files/Console needs no extra bookkeeping. The toggle
  is a small button rendered next to the app switcher pills (visible only while an app
  is open), not a third lane. *Alternative rejected:* putting the mode in the Layout
  popover / persisted grid settings — heavier than the sibling maximize-chat precedent.

- **D2 — Two stable panes inside `.phone__screen`; Chat never moves.** Restructure the
  screen as `<div .phone__screen><div .phone__main>…alt views / cover app… <Chat/></div>
  {split && <div .phone__side><ProductFrame/></div>}</div>`. Chat stays a child of
  `.phone__main` in **both** modes, so toggling split only adds/removes the sibling
  side pane and cannot remount the chat subtree. The cover presentation keeps rendering
  `ProductFrame` inside `.phone__main` exactly as today. *Alternative rejected:*
  absolutely-positioning the app over half the dock — fights the flex layout and the
  contentZoom `zoom` style already applied to `.phone__screen`.

- **D3 — Moving the app between panes relies on the keep-alive host, not the component.**
  The `ProductFrame` component instance may unmount/remount when the slot moves from
  `.phone__main` to `.phone__side`, but the `frameKey` (`dock:<dockId>:<repoId>:<appId>`)
  is identical in both panes, so `LocalAppFrameHost` keeps the same iframe and just
  tracks the new slot geometry (its ResizeObserver/scroll tracking already handles
  moving slots). Per-frame zoom is hoisted in the host, so it survives too. This is the
  load-bearing reason the change is cheap; verify with the headless reload check.

- **D4 — Chat visibility flags treat split as "chat showing".**
  `chatShowing = !showFiles && !showConsole && (!openApp || splitApp)`; the
  chrome-hiding conditions change from `!openApp` to `(!openApp || splitApp)` so the
  left pane is the dock "as it is right now" (git block, discover, understanding rules
  unchanged). Cover mode keeps today's behavior bit-for-bit.

- **D5 — Grid widening reuses the wide-cell span.** `PinnedAgent` reports effective
  split up via a `onSplitChange(tabId, bool)` callback; `Dashboard` renders the cell
  with span 2 when `wide || split`, but **only when the current column count ≥ 2**
  (`min(2, columns)` guard — in a 1-column grid or free-layout narrow panel a `span 2`
  would create an implicit track / overflow, so the cell just stays single-width and
  the two panes flex inside it). Pane sizing: left and right `flex: 1 1 50%` with
  `min-width` floors (~300px left, ~260px right) so both stay usable; `overflow:hidden`
  keeps the grid intact when there genuinely isn't room. *Alternative rejected:* a new
  span-3 "extra wide" tier — more layout surface area than the feature needs.

- **D6 — Advanced gate via a new capability key.** `dockAppSplit: 'advanced'` in
  `UiModeContext.jsx` gates only the toggle; opening apps stays under `localAppTab`
  (Basic). Basic mode therefore always gets cover, satisfying the spec's gate scenario.

## Risks / Trade-offs

- [Chat remounts anyway because the surrounding tree changed] → D2 keeps Chat's parent
  chain and sibling order stable in both modes; the headless test types into the
  composer, toggles split, and asserts the draft text survived.
- [Iframe reloads when the slot moves panes] → same `frameKey` both sides (D3); test
  asserts the app's in-page state (a counter/input inside the test app) survives a
  cover→split→cover round trip.
- [Split dock in Auto columns is still narrow (460px cap)] → the span-2 cell doubles
  the cap to two tracks; min-width floors keep the chat usable. Acceptable first cut;
  a resizable divider is future work.
- [contentZoom (`zoom` on `.phone__screen`) skews host geometry] → the cover overlay
  already renders under the same `zoom` and the host already compensates; split changes
  where the slot sits, not how it is measured. Covered by eyeballing the headless
  screenshots at non-1 zoom.
- [Reflow churn when entering split reorders the grid] → span change is the same
  mechanism as the existing Wide toggle, whose behavior operators already know.

## Open Questions

(none — sized as a frontend-only change; divider resizing and persistence are
explicitly deferred)
