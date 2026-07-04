# Tasks: activity-github-tabs

## 1. Implement (events-app/index.html only)

- [x] 1.1 Keep `#attnWrap` at the top of `<main>`; below it add a `role="tablist"` tab bar with Activity and GitHub tabs
- [x] 1.2 Wrap the existing sections into two `role="tabpanel"` divs: Activity = Sources + add-harness + `#feedSection`; GitHub = `#gh` + `#ghPanel`
- [x] 1.3 CSS: show only the selected panel via `body[data-tab=…]`; hide the tab bar and show both panels under `body.display` (wallboard unchanged); keep existing `body.display` suppressions of addform/acts/feed/sound
- [x] 1.4 JS: tab state from `?tab=` → localStorage → default Activity; select updates localStorage + `history.replaceState` (no reload, no extra poll); arrow-key navigation + `aria-selected`/`aria-controls`

## 2. Verify

- [x] 2.1 Playwright on isolated :5200: default Activity; click GitHub → tiles show, feed hidden, URL `?tab=github`; reload restores GitHub; attention queue visible on both tabs
- [x] 2.2 Playwright: `?display=1` shows no tab bar, both attention + fleet + GitHub tiles visible enlarged; `board.html` still 404s
- [x] 2.3 Confirm one board poll feeds both tabs (no extra request on switch) and the PR browser still drills down from the GitHub tab

## 3. Ship

- [x] 3.1 `openspec validate activity-github-tabs --strict` passes; update understanding-app to show the tab split
- [x] 3.2 No `swap.ps1` needed — events-app/ is served from the working tree, live on reload; operator confirmed the tabs, full width, and light theme on live
