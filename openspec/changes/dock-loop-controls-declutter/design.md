## Context

`DockLoopControl.jsx` is the loop section on every agent dock card. Its header
row holds one ⟳ summary button that expands the popover. Inside the popover,
the suggest/drive mode is a full-width two-button radiogroup
(`phone__loop-modes`, lines ~366–380) followed by a mode hint paragraph, and
the kind picker is followed by a per-kind description paragraph
(`dashboard.loopDesc.*`). The console side already has a deep Loops tab
(`LoopsView.jsx`) with room for prose. The mode semantics are settled
(openspec: unify-loop-types, revision 2): one loop slot per agent, `mode` is a
common axis — `suggest` pre-fills the composer, `drive` sends capped and
audited; `action:'mode'` flips a live instance in place, otherwise mode rides
the arm request.

## Goals / Non-Goals

**Goals:**
- The dock loop section reads as a compact control panel: header row = summary
  button + one Drive checkbox; popover = controls and consequence disclosures
  only.
- No semantics change: same endpoints, same mode derivation, same defaults
  (suggestion kind defaults to suggest, driven kinds to drive).
- The explanations survive, relocated to the console's Loops tab where prose
  belongs.

**Non-Goals:**
- No backend or API change of any kind.
- No removal of safety/consequence disclosures on the dock (queue binding
  line, deny chips, verify hints, replace-warning, gate hints).
- No redesign of the kind picker, parameters, inspection, or Arm/Disarm rows
  beyond deleting the two prose paragraphs.
- No change to the autopilot explainer ("How autopilot works") content.

## Decisions

**D1 — The checkbox lives on the header row, always visible.**
The header row (`phone__loop-row`) becomes summary-button + right-aligned
`Drive` checkbox (new `dashboard.loopDriveCheck` label; tooltip carries the
one-line suggest-vs-drive contrast reusing `dashboard.loopModeHint.*`).
Checked = drive. It renders in both collapsed and expanded states so the mode
is glanceable and flippable without opening the popover — that is the point of
promoting it. Alternative considered: checkbox inside the popover header —
rejected, it would still cost a click to see and the user explicitly asked for
the top-right corner next to the expand button.

**D2 — The checkbox drives the existing two paths untouched.**
`checked` renders the same derived `mode` value the radiogroup uses today.
`onChange`: armed instance of the selected kind → `setLiveMode(checked ?
'drive' : 'suggest')` (existing `action:'mode'` POST, popover stays as-is);
otherwise → `setPickedMode(...)` so the next arm carries it. Disabled while
`busy`. The `phone__loop-modes` radiogroup and the mode hint paragraph are
deleted from the popover.

**D3 — Gate/error feedback must not depend on the popover being open.**
Today `gateHint`/`err` render only inside the popover; a collapsed-state
checkbox flip that 403s would fail mutely. The gate hint and error message
blocks move out of the `{open && ...}` subtree to render directly under the
header row whenever set. Alternative: auto-open the popover on failure —
rejected as jumpy; a message under the row is calmer and reuses the existing
copy.

**D4 — Prose leaves the popover; keys are reused, not retired.**
The per-kind description paragraph (`loopDesc.*` render at ~line 362) and mode
hint paragraph (~line 381) are removed from the dock. `LoopsView` gains a
static reference block at the top — "What a loop is": the four kinds
(💡/📋/🎯/🗒️) each with their existing `dashboard.loopDesc.*` copy, plus a
suggest-vs-drive pair from `dashboard.loopModeHint.*`. Pure static render, no
backend call. The dock popover keeps a single short pointer line ("details in
Autopilot → Loops", new key `dashboard.loopMoreInfo`). Reusing keys keeps
en/tr in lockstep with zero translation churn.

**D5 — CSS scope.**
`phone__loop-row` becomes a flex row with the checkbox pushed right
(`margin-left: auto`); a small `phone__loop-drive` label style matches the
existing dock chrome. The console block reuses autopilot.css section styling.
No other layout shifts.

## Risks / Trade-offs

- [One-click live mode flip on a collapsed header invites accidental drive
  enables] → the action stays operator-gated server-side (403 → visible hint,
  D3); the checkbox is disabled while busy; and drive remains capped +
  audited. This is the same risk profile as the old radiogroup, minus one
  click of friction — accepted, that friction removal is the feature.
- [Checkbox state can look stale next to an armed loop of a *different* kind
  than the popover's selection] → unchanged from today: the derived `mode`
  already switches basis with `selected`; collapsed, `selected` equals the
  armed kind, so the checkbox mirrors the live instance.
- [Removing dock prose could orphan first-time users] → the pointer line plus
  the console reference block cover it; the collapsed summary still names
  kind · armed · mode in words.

## Migration Plan

Frontend-only, ships with the branch build; no data or config migration. A
rollback is a straight revert of the commit.

## Open Questions

(none)
