# Multi-pane -- raise the pane cap to five

> **Status (2026-06-12):** Implemented on `feature/multi-pane-five`,
> browser-verified on the isolated :5201 preview
> (`.preview-test/verify-five-panes.mjs`, 6/6 checks: 3840px -> 5 panes,
> 2100px -> 5, 2000px -> 4, 900px -> 2, edge clamping with n=5, Basic mode
> untouched). Not yet merged/deployed.
> Increment of [multi-pane.md](multi-pane.md) (Deployed).

## Why

On a maximized 4K monitor (3840px) the pane formula
`clamp(floor(innerWidth / 420), 1, 4)` computes 9 but the hard cap stops at
4 panes. The End User wants a fifth pane visible on that screen.

## What changes

| File | Change |
|---|---|
| `client/src/layout/PaneStrip.jsx:23` | `MAX_PANES = 4` -> `5` |
| `plans/multi-pane.md` | Update the formula text (`1, 4` -> `1, 5`) so the deployed plan does not lie |

That is the whole change:

- The 5th pane appears only at `>= 2100px` window width (5 x 420px min pane
  width). Laptops/phones see exactly what they see today; a 4K maximized
  window gets 5 panes of 768px each.
- No CSS work: `.app-frame--multi` already removes the width caps and panes
  are equal-width flex columns.
- No backend work; capability gating unchanged (still `multiPane: 'advanced'`).

## Not doing (unless asked)

- Removing the cap entirely (width-driven, would give 9 panes on 4K) --
  rejected for now: pane bars + nav get noisy, and nobody asked for more
  than 5.
- Per-pane resize handles -- still the accepted v1 limitation.

## Verification

- `npm --prefix client run build` passes.
- Playwright per docs/claude-web/browser-testing.md on the isolated preview
  (self-dev rules): viewport 3840px -> exactly 5 panes; 1680-2099px -> 4
  panes (no regression at the old max); 900px -> 2; centering and edge
  clamping still hold with n=5 (anchor first/last tab).
