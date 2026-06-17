# Understanding — wash the whole coloured dock in the agent colour

## Goal
Right now a coloured agent dock shows the agent colour only on its **left border**
and **header bar**. You want the colour to extend across **the whole dock** — the
lanes, git row, and especially the **chat area background** — so a coloured agent
reads as "this whole dock is that colour," not just a stripe at the top.

## What I'll do
- In `client/src/pages/dashboard.css`, on `.phone[data-colored='true']`,
  **re-tint the surface design tokens** (`--color-surface`, `--color-bg`) with a
  light `color-mix` of `--agent-color`, instead of trying to paint a background on
  `.phone` (which the opaque inner regions cover — the reason the plan stopped at
  the header).
- Because every dock region **and the same-DOM embedded `<Chat>`** read those
  tokens, the wash cascades everywhere automatically — including the chat
  background and message surfaces.
- Keep it **subtle and readable**: surface stays a touch lighter than bg so chat
  bubbles/cards still layer; the header bar naturally stays the most saturated
  anchor. Accent colours, code blocks, and borders are untouched.
- Update `plans/dock-color-background.md` (its "header only / full tint does NOT
  work" note is now superseded) and rebuild + self-dev swap to live :5099.

## Assumptions
- Single light theme today (no dark theme), so mixing against the literal base
  values from `global.css` is safe and avoids a self-referential CSS-variable cycle.
- "And stuff" = the rest of the dock chrome + chat; not the accent/brand controls.
- Tasteful default intensity; easy to dial up/down if you want it stronger/weaker.
