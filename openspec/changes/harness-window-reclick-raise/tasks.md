# Tasks — harness-window-reclick-raise

- [x] Reproduce the report in headed Chrome with real tab focus (`check-harness-reclick.mjs`): A / B / A leaves the launcher on top; try the candidate fixes side by side.
- [x] `harnessWindow.js`: keep the launcher handle per dashboard window (`launcherHandle`); after a "focused" answer raise the agent tab from the dashboard (`raiseNamedTab`, closes a stray blank); send a browsed-away launcher tab back to the launcher URL.
- [x] Unit tests (`harnessWindow.launcher.test.mjs`): no second launcher lookup on a re-click, the dashboard raises the agent tab, a closed launcher is looked up again, a stray blank lookup is closed.
- [x] Understanding app tab 6: the re-click rows and the corrected rule (what raises a tab).
- [x] Rebuild the Management bundle (`npm --prefix client run build:manage`).
- [ ] Operator: A / B / A with the harness window on the other monitor.
