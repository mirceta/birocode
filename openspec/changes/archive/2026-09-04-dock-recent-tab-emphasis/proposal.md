# Proposal: dock-recent-tab-emphasis

## Why

The dashboard's dock toolbar (the strip of agent tabs above the grid) already narrows
the roster with a segmented filter — **All / main / not main / running** — but the
operator's day-to-day triage question is "which agents have I actually been working
with lately?" With a full roster of docks, most of them cold, the tabs the operator
prompted this morning are indistinguishable from ones untouched for a week, and the
handful that need attention right now (a run in flight, or a `!` result nobody has
seen) are the same 12-px pill as everything else.

## What Changes

- **A fifth filter state, `recent`.** The strip's segmented control gains a **recent**
  state that renders only tabs whose agent was **sent a prompt in the last 5 hours**.
  It is one more mutually exclusive state of the existing control, so everything the
  other states already guarantee applies unchanged: grid-visible and important docks
  are exempt (always rendered), the +N excluded-tab chip shows, the selection is
  view-local/ephemeral, and reorder mode suspends it.
- **A server-owned `lastPromptAt` on each dock tab.** "Sent a prompt" is recorded by
  the server at builder-lane run start — the single choke point every prompt path
  funnels through (user send, autopilot auto-send, loop resend) — and persisted on the
  dock tab, exactly like the existing `unseenResult` latch. Clients only read it. This
  is what makes the filter work for docks **hidden from the grid** (the client only
  fetches transcripts for grid-visible docks, by design — see openspec
  `reduce-connection-appetite`), and it survives page reloads and harness restarts.
- **Running and alerting tabs render ~50 % larger.** A tab whose dot currently shows
  the running state or the `!` unseen-result marker renders **emphasized**: about 1.5×
  the type size, dot, and padding of a normal tab, so it stands out in a crowded strip.
  This applies in **every** filter state (not just `recent`) and reuses the same
  `isRunning` / `isUnseen` classification the dot and the `running` filter already
  share — emphasis can never disagree with the dot. The tab's meaning and click
  behavior are unchanged; only its size changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: the dock toolbar filter gains a **recent** (last 5 h) state; dock tabs
  carry a server-owned last-prompt timestamp; running / unseen tabs render emphasized.

## Impact

- **Server** (small): `DockTab.LastPromptAt` (ms epoch, nullable) in
  `Services/Dock/DockRegistry.cs` + `DockController` DTO; a `RunStarted` event on
  `RunSessionService` (mirror of the existing `RunCompleted`) fired from
  `TryBeginRun`; the existing `DockUnseenResultTrigger` (or a sibling) subscribes and
  stamps every tab of the started run's repo. Builder lane only, like the busy dot.
- **Frontend**: `client/src/components/dashboard/DockToolbar.jsx` (new filter state,
  emphasis class), `client/src/pages/dashboard.css` (emphasized tab sizes),
  `client/src/i18n/en.json` / `tr.json` (labels).
- No new polling, no new endpoints: `lastPromptAt` rides along on the dock roster
  the dashboard already loads/refreshes; aging out of the 5 h window happens on the
  strip's existing 5 s re-render.
- Advanced-mode gate unchanged (the strip is already behind it).

## Assumptions (please confirm)

- **"Render them 50 % bigger" refers to the toolbar tabs**, not the dock tiles in the
  grid. The request is framed around the tab strip and its filters, and the tiles
  already have their own size controls (wide, hot/cards view). If you meant the grid
  tiles, say so and this proposal will be revised.
- **"Alert" = the `!` unseen-result marker** (a run finished while the dock was
  hidden), which is the strip's only alert indicator today. Error status has no
  distinct presentation on the strip dot, so it is not treated separately here.
- **"Sent a prompt" = a builder-lane run started** for the dock's repo, whichever
  path started it (operator, autopilot, loop). Ask-lane side conversations do not
  count, consistent with what the busy dot tracks.
- The 5-hour window is a constant (`RECENT_MS`), not a setting.
