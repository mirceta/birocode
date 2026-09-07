# Proposal: agent-badge-identity — a second, colour-independent dimension on every agent badge

## Why

The fleet has grown to the point where colour alone no longer tells agents apart: the
shared machine/repo palette has twelve hues, the same repository cloned on several
machines shares one repo tint, and about six agents end up on one hue. On the Kanban
board a card's agent chip could not be read by its colour any more, and on Fleet Status
the chips had the same problem. The Operator wants a second visual dimension, identical
on both views, so that one glance at a badge names the agent exactly (fleet board task
`4ddcfce381bc4035aee98297ab7f164c`, 2026-09-07).

## What

- **One identity mark per agent** from the shared colour module (`graphColors` /
  `useTaskColors`, the same place both views already take their hues): a **glyph** (one
  of 16 geometric shapes) and a **monogram** ("rz/prg2" = machine skeleton / repo prefix
  + handle index). Both are pure functions of the agent's stable identity — the machine
  key + repo key both views already derive, plus the machine label and repo handle the
  fleet reports — never of list order or of the persisted hue slots. Same agent, same
  mark, on every device, after every reload, in both views.
- **One badge component** (`AgentMark`) renders it: the glyph and the monogram in the
  chip's text colour, with the full handle as title and aria-label, so the agent is
  identifiable without colour and fully named for a screen reader.
- **Applied now** to the Fleet Status agent chips and to the Kanban card assignee chips
  (both card and detail views), since PR #83's chips are on main. Hue + glyph + monogram
  together are unique even when the hue repeats; the monogram alone is unique.

## Coordination

Task dfee16ea (an activity dot on the same Kanban chip) stacks on this badge: the mark
leads the chip text, so the dot should be added beside it without moving the mark. The
stacking order is #83 (merged) → this change → dfee16ea.

## Out of scope

The Task graph nodes (they show machine/repo colour only and carry the handle as text);
changing the hue palette or its assignment.
