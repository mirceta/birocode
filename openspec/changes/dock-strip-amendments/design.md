# Design: dock-strip-amendments

## Context

The dock toolbar (`client/src/components/dashboard/DockToolbar.jsx`) renders one tab per
roster dock from the same `tabs` array the grid uses (DockContext roster). Each tab already
derives: `active` (`tab.dashboard !== false`), `running` (from the `live` map), `unseen`
(`tab.unseenResult`), `branch` (from the `git` map), `important`, and reorder-mode state.
The queued-prompt state is also already on the roster: `tab.stash` is the per-agent prompt
stash, synced by DockContext for every tab including hidden ones — the grid cell already
uses `tab.stash?.length` for its `dash-cell--queued` black border (`Dashboard.jsx:744`).
Visibility toggling goes through `onToggle(tab.id, active)` → the parent's `updateTab`
path, one dock at a time.

## Goals / Non-Goals

**Goals:**
- Make queued prompts visible from the strip, for hidden docks especially.
- One-click "show all" / "hide all" roster visibility.

**Non-Goals:**
- No change to tab click semantics, reorder mode, star, branch row, or roster order.
- No backend or endpoint changes; no new persisted state.
- No queue management from the strip (no peeking/removing stashed prompts).

## Decisions

1. **Queued indicator = black ring around the tab's existing dot** (`box-shadow`/`border`
   in the queued-border black), not a separate glyph. Rationale: the dot is the tab's
   status surface; a ring composes with every dot state — assigned color at rest, black
   pulsing while running, `!` when unseen — without a precedence fight, mirroring how the
   tile spec lets a layered glow coexist with the queued border. Alternative considered:
   a count badge (rejected — the strip is dense; existence, not count, is the signal, same
   as the tile border).
2. **Data source: `tab.stash?.length` directly in DockToolbar.** The roster tabs already
   carry the stash for the full roster; no new prop shape beyond reading the field the
   grid cell reads. Alternative: threading a separate `queued` map like `live`/`git`
   (rejected — duplicate of data already on `tabs`).
3. **Bulk controls = two small buttons next to the ⇄ reorder toggle** ("show all" ▣ /
   "hide all" ▢, i18n-labeled), calling a new `onToggleAll(visible)` prop. The parent
   implements it by iterating the existing per-dock update path (same call `onToggle`
   uses) over docks whose `dashboard` state differs from the target — no new server
   endpoint; N small updates is fine at roster scale (≤ ~15 docks). Buttons are disabled
   when they would be no-ops (all already shown / all already hidden). Alternative: a
   single "invert"/tri-state control (rejected — two explicit verbs are clearer).
4. **Reorder mode leaves bulk controls inert** (disabled while ⇄ is on) so mode semantics
   stay "reorder owns the strip's clicks".
5. **Accessibility**: queued state joins the tab's composed aria-label/title fragments
   (like important/branch); bulk buttons get aria-labels.

## Risks / Trade-offs

- [N sequential visibility PATCHes on bulk toggle] → acceptable at roster scale; issued
  through the same optimistic-update path so the strip/grid react immediately; failures
  reconcile on the next roster refresh, same as single toggles today.
- [Ring legibility on small dots / dark dot colors] → use the same near-black token as the
  queued tile border with a 1px light gap (halo) so it reads on any assigned color.
- [Stash freshness for hidden docks] → stash sync already covers hidden docks (DockContext
  syncs the roster, not just rendered tiles); verified by the grid-cell border behaviour.

## Migration Plan

Frontend-only; ships with the normal client build. No data migration, no rollback concerns
beyond reverting the commit.

## Open Questions

- None blocking. (If the operator later wants queue *counts* on the strip, the ring can
  gain a numeral without a spec change to the toggle semantics.)
