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
- [ ] 2.2 Same check on the studio route after the harness self-upgrade.
