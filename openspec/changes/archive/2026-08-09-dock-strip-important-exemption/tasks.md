## 1. Strip filter logic (DockToolbar.jsx)

- [x] 1.1 Add the important exemption to `matchesFilter`, immediately after the grid-visible exemption: a tab with `tab.important` set matches every filter state
- [x] 1.2 Update the file's header comment: the exemption paragraph names both exemptions (grid-visible AND important), tagged `openspec dock-strip-important-exemption`

## 2. Verify

- [x] 2.1 `npm --prefix client run build` passes
- [x] 2.2 Playwright check per `docs/claude-web/browser-testing.md`: with a roster containing a hidden idle important dock, a hidden idle non-important dock, and a visible dock — confirm under **running** the important dock's tab renders (with ★) while the non-important idle dock is excluded; under **on main** / **not on main** the important dock's tab renders regardless of branch; the +N count excludes important docks
- [x] 2.3 Confirm un-starring the hidden important dock (via the dock panel/grid star) drops its tab from a non-matching filtered view without reload
