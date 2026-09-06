## 1. Build

- [x] 1.1 `graphColors.js` (pure): palette, `assignSlots` (first-seen, keeps saved, unique
      up to the palette, deterministic wrap), `machineKey`, `repoKey` + `normalizeRemote`,
      `nodeStyle`, per-device persistence.
- [x] 1.2 `GraphLegend.jsx` + `TaskGraphPanel.jsx`: machine boxes no longer rendered
      (legacy boxed tasks shown absolute + migrated once), nodes coloured by machine
      (border) and repo (background) from the fleet status, two pinned legends with
      focus, cross-machine edges by assignee machine; `taskgraph.css` (light + dark).
- [x] 1.3 `npm --prefix client test` (node --test) wired.

## 2. Verify

- [x] 2.1 Colour assignment tests (`graphColors.test.mjs`, 9): stability across order
      and reloads, uniqueness up to the palette size, deterministic wrap, neutral for
      unassigned, remote-URL unification, storage round trip. 9/9.
- [x] 2.2 Rendering check on an isolated instance (`check-graph-colours.mjs` via
      `.claudeweb-preview/graph-colours-e2e.ps1`): no boxes rendered; assigned nodes
      carry machine + repo classes, unassigned neutral; same machine = same border,
      other machine = other border; same remote = same background, other repo = other
      background; borders ≠ backgrounds; legacy boxed task at its absolute place with
      its siblings' colours; both legends present, above the canvas, unmoved by a
      200 px pan; legend focus dims non-matching nodes; colours persist across reload;
      no page errors. 19/19.
- [ ] 2.3 Deploy + look at the real board (not part of this task: do not deploy).
