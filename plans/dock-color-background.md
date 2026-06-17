# Dock colour background — tint the agent dock, not just its border

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-17): BUILT.** On `feature/dock-color-background`. Implemented + frontend
> rebuilt (`client/dist`). Design adjusted during build — see "Approach" note below.

## Goal

An agent can be assigned a colour (plans/agent-color.md), shown as a coloured **border**
on its dock. Also paint the dock **background a very light shade of that colour**, so the
colour stays identifiable even when the **border is overridden** — specifically when the
agent is marked **important** (plans/important-agents.md), which repaints the border bright
red and otherwise makes a coloured agent indistinguishable from any other important one.

## Where it is now

`client/src/pages/dashboard.css`:
- **Cards** already do this: `.dash-cell[data-colored='true']` (line ~230) sets both the
  `border-left` *and* a tinted `background: color-mix(in srgb, var(--agent-color) 12%,
  var(--color-surface))`.
- **Phone docks** do NOT: `.phone[data-colored='true']` (line ~630) sets only
  `border-left: 4px solid var(--agent-color)` — no background tint. So an important phone
  dock (red 6px border) loses its colour entirely.

Both surfaces already receive the colour via `--agent-color` + `data-colored` (cards in
`Dashboard.jsx`, phones in `PinnedAgent.jsx`), so this is **CSS-only**.

## Approach

**Built (note — adjusted from the original plan):** tinting `.phone` itself does NOT work.
Unlike a card (whose content is transparent), every inner region of a phone dock paints an
opaque `var(--color-surface)`: `.phone__bar`, `.phone__lanes`, `.phone__git`, and the chat
inside `.phone__screen`. A `background` on `.phone` would be completely covered. So the tint
is applied to the **header bar** instead — `.phone[data-colored='true'] .phone__bar` — which
sits right beside the colour border and is the natural identity cue:

```css
.phone[data-colored='true'] .phone__bar {
  background: color-mix(in srgb, var(--agent-color) 16%, var(--color-surface));
}
.phone[data-colored='true'] .phone__bar:hover {
  background: color-mix(in srgb, var(--agent-color) 26%, var(--color-surface));
}
```

This survives the `--important` state: the red border and the bar tint are independent
properties, so an important + coloured dock shows **red border + colour bar** →
distinguishable again. Used 16% (vs the card's 12%) so it reads under the red border, plus a
matching hover variant (the bar doubles as the maximize button). Cards unchanged.

## Out of scope

- No change to the colour picker, the important/waiting marks, or recency borders.
- No new colour storage — reuse the existing per-agent `color`.

## Verify

Build, deploy to live :5099 (self-dev swap), browser-verify: a coloured phone dock shows a
light colour tint on its header bar; marking it important keeps the tint (red border + colour
visible); an uncoloured dock is unchanged; cards still look right. **Build done; live
browser-verify still pending** (needs the dashboard up with a coloured + important agent).
