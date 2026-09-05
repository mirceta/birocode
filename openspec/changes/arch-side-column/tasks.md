## 1. Build

- [x] 1.1 `Arch.jsx`: side cards lifted into one fragment rendered in the aside or in
      the Fleet lane; `sideWidth` / `sideOpen` persisted; gutter with pointer capture;
      lane-bar toggle; `arch.css` gutter / toggle / overview grid / narrow rules.
- [x] 1.2 Rebuild the harness client and the Management App bundle.

## 2. Verify

- [x] 2.1 Browser check (`.claudeweb-preview/playwright/check-arch-side.mjs`): four
      lanes; gutter drag +120 px persists across reload; Fleet lane shows Loop,
      Managed agents, Fleet, Home repo cards full width with no side column; hide /
      show side persists; no page errors.
      DONE 2026-09-05 on live through the Management App (13/13, side 340 → 460 px).
- [x] 2.2 Same check on the studio route after the harness self-upgrade.
      DONE 2026-09-05: the studio route at desktop widths runs the multi-pane strip, so
      the Arch pane is ~430 px and its columns STACK (the pre-existing narrow rule); there
      the divider is hidden and the side column takes the pane width, while the Fleet lane
      and hide/show still work (isolated studio run PASS). The two-column resize is
      exercised where the surface is wide: Management App / dashboard embed (live, 13/13).
