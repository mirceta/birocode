# Proposal: dock-strip-amendments

## Why

The dashboard's dock toolbar (the horizontal strip listing every agent dock) has grown into
the operator's roster overview — busy dots, unseen-result exclamations, importance stars,
branch rows, and reorder mode. Two gaps remain. First, queued prompts are invisible from the
strip: the thick black queued border marks dock tiles, but a **hidden** dock with queued work
shows nothing anywhere — the operator can't tell that prompts are waiting on an agent whose
tile isn't rendered. Second, with a full roster the strip's one-tab-at-a-time visibility
toggle makes common moves tedious: focusing on one dock ("hide everything else") or coming
back to the full wall ("show everything") takes a click per dock.

## What Changes

- **Queued-prompt indicator on strip tabs.** A tab whose agent has one or more queued
  prompts (a non-empty per-agent prompt stash) gets a visible queued marker on its dot —
  reusing the existing thick-black queued visual language — including tabs of docks hidden
  from the grid. Running keeps its existing precedence on the dot; the queued marker is
  drawn so it can coexist with the at-rest color, the running state, and the unseen-result
  exclamation. The tab's accessible label conveys the queued state.
- **Bulk show/hide controls on the strip.** Two display-affecting controls next to the
  reorder toggle: **show all** (renders every dock in the grid) and **hide all** (hides
  every dock, leaving the recoverable empty grid + strip that already exists). Both act
  through the same per-dock `dashboard` visibility path the tabs already use — no new
  state, no effect on the docks themselves.
- No changes to tab click semantics, reorder mode, star, branch row, or ordering.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: the dock toolbar gains (a) a queued-prompt indicator on each tab, extending
  the queued-prompt signal (today: tile borders only) to the strip and thus to hidden docks,
  and (b) bulk show-all / hide-all visibility controls driving the existing per-dock
  `dashboard` state.

## Impact

- **Frontend only.** `client/src/components/dashboard/DockToolbar.jsx` (indicator + bulk
  controls), `client/src/pages/Dashboard.jsx` (pass queued-count data; bulk-toggle handler
  over the existing per-dock update path), `client/src/pages/dashboard.css`,
  `client/src/i18n/en.json` / `tr.json` (labels).
- **No backend changes expected.** The queued-prompt count must reach the toolbar the same
  way other roster-wide signals do (as `live`/tab data covering hidden docks too); if the
  dashboard's current polling doesn't carry queue counts for hidden docks, the existing
  roster/live endpoint payload is extended — no new endpoint.
- Advanced-mode gate unchanged (strip is already behind it). Basic mode unaffected.
