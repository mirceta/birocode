# Design: split-no-forced-wide

## D1 — Remove the coupling, keep the mechanism

`dash__cell--wide` stays, driven only by the persisted per-dock `tab.wide` flag
(⤢ toggle). The ephemeral `splitDocks` map, `handleSplitChange`, the `splitWide`
computation in `renderDock`, and PinnedAgent's `onSplitChange` prop + effect are
deleted outright — nothing else consumed them.

## D2 — Container-aware pane floors

The old floors assumed a widened cell (≥ ~700px row): `phone__main ≥ 300px`,
`phone__side ≥ 260px`. In a normal cell (~350px) those sum past the row and the
flex items refuse to shrink → horizontal overflow. New floors:

- chat: `min-width: min(300px, 45%)`
- app: `min-width: min(260px, 38%)`

45% + 38% + 7px divider < 100% at any width, so the row can never overflow; on
wide cells `min()` resolves to the old px floors, so behavior there is
unchanged.

## D3 — Drag clamp mirrors the CSS

`moveDivider` clamps ratio to `[lo, hi]` where
`lo = min(300·zoom/rowWidth·100, 45)` and `hi = 100 − min(260·zoom/rowWidth·100, 38)`.
Since `lo ≤ 45 < 62 ≤ hi` always holds, the old too-narrow 20–80 fallback is
dead and removed. Double-click reset (50) and arrow-nudge are untouched.

## D4 — What does NOT change

Pane DOM identity, the keep-alive frame slot, chrome visibility rules, the
divider element/interaction, ratio ephemerality, Advanced gating. The spec's
"no room to widen still renders" scenario becomes the norm rather than the
degraded case.
