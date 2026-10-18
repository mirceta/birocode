# Tasks — harness-tabs-left-window

- [x] Investigate every earlier attempt (#109/#110, #123, #124, #125) and measure in real Chrome why tabs fell back into the dashboard's window (`check-left-window.mjs`, `check-left-window-reload.mjs`): the error-page reload replaces the browsing-context group; unrelated tabs are never found by name.
- [x] Measure what raises an existing tab (`check-raise-timing.mjs`): the dashboard's `window.open('', name)` from its click raises a tab the host opened; the host's own focus() never does.
- [x] `harnessHost.js`: BroadcastChannel roll call + open, window guard, host pick, queue while in the dashboard's window, hand-over to an older host, dashboard raise by name with a one-time stray guard.
- [x] Placement defaults to the left window (new key); retire the popup window, screen picker and launcher-by-name code.
- [x] The host page (`?launcher=1`, both bundles), the Settings section (live host status, one-time setup), toast wording for every outcome.
- [x] Unit tests (`harnessHost.test.mjs`, 12) and the full client suite (293).
- [x] Real-Chrome lab on the hub (`leftwin/lab.ps1`): 29/29; drag flow with chrome.tabs ground truth: 10/10 ×3; frames + GIF.
- [x] Understanding app: the investigation, the options, the protocol, the evidence.
- [x] Rebuild the Management bundle.
- [ ] Operator: allow pop-ups for the hub's site once, place the host tab in the left window, click three agents, refresh, click again.
