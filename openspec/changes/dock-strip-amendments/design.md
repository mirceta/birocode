# Design: dock-strip-amendments

## Context

The dock toolbar (`client/src/components/dashboard/DockToolbar.jsx`) renders one tab per
roster dock from the same `tabs` array the grid uses (DockContext roster). Each tab
already derives `active` (`tab.dashboard !== false`), `running` (from the `live` map),
`unseen` (`tab.unseenResult`), `important`, reorder-mode state, and — key here — `branch`
from the dashboard's per-repo `git` map (`git?.[tab.repoId]?.branch`, with `'unknown'`
normalized to "no branch"). The strip introduces no git polling of its own; the dashboard
refreshes the git map and the strip re-renders from props.

The operator wants to narrow the strip by mainline status: only agents on `main`/`master`,
only agents that aren't, or everything.

## Goals / Non-Goals

**Goals:**
- A three-state branch filter (All / on main / not on main) over the strip's tabs.
- Zero new data flow: classify from the `git` map the strip already receives.
- Never lose an agent silently: filtered views show a hidden-tab count.

**Non-Goals:**
- No filtering of the dashboard grid and no writes to any dock's persisted `dashboard`
  visibility — this is a strip *view* filter, not a visibility mutation.
- No server-side or cross-device persistence of the selection.
- No change to tab click semantics, dot states, star, branch row, roster order, or
  reorder mode's behavior on the full roster.
- No per-repo configuration of what counts as mainline.

## Decisions

1. **Filter = view-local `useState` in DockToolbar**, same lifecycle as reorder mode's
   state (resets on unmount/reload). Alternative: lift to Dashboard or persist in
   localStorage (rejected — the spec wants ephemeral; reorder mode sets the precedent for
   strip-local mode state).
2. **Control = three-button segmented group** next to the ⇄ reorder toggle: `All`,
   `⎇ main`, `⎇ ≠main` (i18n-labeled, `aria-pressed` on the active segment). Alternative:
   a single cycling button (rejected — three explicit states are discoverable and
   accessible; a cycler hides the state space).
3. **Classification**: `mainlike = branch === 'main' || branch === 'master'` after the
   existing `'unknown'` normalization. Unknown-branch tabs match neither filtered state
   and render only in All — classifying the unclassifiable into either bucket would lie;
   the hidden-tab count keeps them from vanishing unnoticed. Docks sharing a repo share
   the classification (branch data is per-repo, as the baseline spec states).
4. **Hidden-tab count** renders as a small non-interactive `+N` chip at the strip's end
   while a non-All state excludes tabs, with the count also folded into the filter
   group's accessible label. Alternative: dimming excluded tabs instead of removing them
   (rejected — the point of the filter is less strip to scan).
5. **Reorder mode suspends the filter** (full roster renders, filter buttons disabled,
   selection retained and reapplied on exit). Reordering operates on the full id order;
   filtering while placing would make "move before that tab" ambiguous against invisible
   neighbors. This keeps the established rule: reorder mode owns the strip's semantics.
6. **`onToggle` still receives the tab's real `active` state** — filtering changes which
   tabs render, not what a rendered tab's click does.

## Risks / Trade-offs

- [Operator filters, forgets, and thinks agents are gone] → the `+N` hidden count plus the
  visibly active segment; reload resets to All.
- [Branch data momentarily stale after a checkout] → same staleness the branch row already
  has; the git map refresh re-buckets tabs live, spec'd explicitly.
- [Empty strip when a filter matches nothing] → the strip keeps the label, controls, and
  `+N` count, so the state is legible and reversible with one click on All.

## Migration Plan

Frontend-only; ships with the normal client build. No data migration; rollback = revert
the commit.

## Open Questions

- None blocking. (If other mainline names ever matter — `trunk`, `develop` — the
  `mainlike` predicate is one place to extend, at the cost of a spec amendment.)
