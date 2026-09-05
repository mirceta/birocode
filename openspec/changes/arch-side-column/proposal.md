# Proposal: arch-side-column — resizable side column + a Fleet lane on the Arch surface

## Why

The Arch surface's right-hand column (Loop, Managed agents, Fleet, Home repo) is a
fixed 340 px strip. With a growing fleet it is cramped, and it steals width from the
conversation when the operator only wants to read. The operator asked for the column
to be horizontally resizable and for the same content to have its own lane next to
Chat · Tools · History.

## What

- A **draggable gutter** between the conversation and the side column; the column's
  width follows the pointer (240 px minimum, at most 70 % of the surface) and
  persists per device.
- A **hide / show side** toggle in the lane bar; the hidden state persists.
- A fourth lane, **🛰 Fleet**, that renders the same cards full width as a responsive
  grid (the side column is not shown while that lane is active, so nothing is drawn
  twice).
- On narrow screens (≤ 900 px) the columns stack as before; the gutter is hidden.

Applies to every host of the component: the studio Arch tab, the dashboard's
Management layer and the Management App.

## Out of scope

Reordering or hiding individual cards.
