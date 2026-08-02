## Why

The loop section at the top of each agent dock has grown into a wall of controls
and prose: the Suggest only / Drive autonomously choice spans a full row as a
two-button radiogroup with its own hint paragraph, and every loop kind renders a
description paragraph inside the popover. Loops are algorithms with input
parameters — the dock should read like a small control panel (pick a kind, set
its parameters, arm), not like documentation. The explanations belong in the
Autopilot console, which exists exactly for that and has the space.

## What Changes

- The suggest/drive mode choice collapses from a full-row radiogroup + hint
  paragraph into a single compact **Drive checkbox** sitting on the loop
  section's header row, in the top-right corner next to the ⟳ summary button
  that expands the section. Checked = drive (the loop sends its own prompts),
  unchecked = suggest-only (pre-fill the composer). Same semantics as today:
  it flips a live armed instance in place, otherwise it sets the mode the next
  arm will use.
- The dock popover drops its explanation prose: the per-kind description
  paragraph (`dashboard.loopDesc.*`) and the per-mode hint paragraph
  (`dashboard.loopModeHint.*`) disappear from the dock. What remains is
  controls only — kind picker, the selected kind's parameters, prompt
  inspection, Arm/Disarm/Resume — clean and scannable.
- The removed explanations (what each kind does, what suggest vs drive means)
  move to the Autopilot console's Loops tab as a reference block, where there
  is room for full sentences. The dock popover gets at most a single short
  pointer to it.
- Existing safety disclosures on the dock are NOT removed: the queue binding
  line, deny-list chips, verification toggle hints, gate-closed hints, and the
  replace-warning stay — those state consequences of an action, not reference
  prose.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `autopilot-loops`: the dock loop section's mode control becomes a header-row
  drive checkbox (ADDED requirement); the dock popover is required to be
  controls-only with kind/mode reference copy relocated to the autopilot
  console's Loops tab (ADDED requirement). Existing engine/disclosure
  requirements are unchanged.

## Impact

- `client/src/components/dashboard/DockLoopControl.jsx` — header row gains the
  checkbox; mode radiogroup and the two `phone__loop-sect-desc` explanation
  paragraphs leave the popover.
- Autopilot console Loops tab (`client/src/components/autopilot/…`) — gains the
  kind + mode reference block.
- `client/src/i18n/en.json` / `tr.json` — new checkbox label/tooltip and console
  reference copy; dock-only description keys retire or move.
- `client/src/pages/dashboard.css` (dock loop styles) and `autopilot.css` —
  header-row layout for the checkbox, reference block styling.
- No backend change: `POST /autopilot/loop` with `action:'mode'` and the arm
  request's `mode` field already carry everything the checkbox needs.
