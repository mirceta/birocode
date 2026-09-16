## 1. Build

- [x] 1.1 `arch.css`: `.arch--solo .arch__main` keeps `flex: 1 1 auto; min-height: 0` in
      the stacked layouts; `.arch__top` sticky wrapper for the title row + lane strip.
- [x] 1.2 `Arch.jsx`: wrap head + lanes in `.arch__top`; `arch--solo` whenever no side
      column is rendered. `Tasks.jsx`: same wrapper; always `arch--solo`.
- [x] 1.3 Rebuild the harness client (compile check) and the Management App bundle
      (`events-app/manage`, served from the working tree).

## 2. Verify

- [x] 2.1 Rendering test `client/tests/ui/pinned-conversation-lanes.mjs`
      (`npm --prefix client run test:ui`, `playwright` devDependency): five
      viewport/layout cases, both panes; fails on the unfixed code in every narrow-pane
      case (`others: arch__cols`, list overflow 0px), passes after the fix
      (2026-09-06, 60 checks).
- [x] 2.2 Repo-agent dock checked: different component (`.chat__bar` + `.chat__scroll`),
      already pinned by construction; nothing to change.

## 3. Ship

- [ ] 3.1 Merge to main (PR), deploy with `swap.ps1` and keep on the operator's
      instruction; the Management App bundle is live on refresh once the branch is
      checked out on the serving harness.
