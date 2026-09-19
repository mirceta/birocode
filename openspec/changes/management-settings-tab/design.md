# Design — the Settings tab and badge-link placement

## D1. Placement is one device-local setting consulted at click time

`harnessWindow.js` owns `{ mode: 'tabs' | 'window', screen }` under `manageapp.harnessWindow`
(this browser only, like the dashboard's layout keys). `focusAgentTab(key, url)` reads it on
every click: `tabs` → today's `window.open('', perAgentName)` (find-don't-reload + focus);
`window` → `openInHarnessWindow(url, placement)`. The Kanban never changed.

## D2. The dedicated window

`window.open('', 'birocode-harness-window', featuresFor(screen))` where the features are
`popup=1,left,top,width,height` from the chosen screen's work area (`availLeft/Top/Width/
Height`), or a sized window on the current screen when none is chosen. Any sized/positioned
features make Chrome open a separate window — that is the point; the name makes every later
call reuse it (position preserved wherever the Operator dragged it). The handle is navigated
unless it already shows the URL (a cross-origin handle — another machine's harness — is
navigated anyway; reading throws, writing is allowed) and focused.

## D3. Screen picking, honestly

`screenPicking(window)` reports `{ available, secure, extended, reason }`: the API needs
`isSecureContext` and `getScreenDetails`; the Settings tab shows "Detect screens…" (a click →
the permission prompt → the list → pick one; `screenRecord` keeps only the fields we place
with plus the label) or the reason it cannot. Without the permission Chrome clamps the
position to the current screen; the setting still creates one persistent window the Operator
parks once. "Open the harness window now" lets them park it before the first badge click.

## D4. The cards split by purpose

`Arch`'s fleet-wide cards were one fragment. They are now four named pieces — Managed agents,
Fleet, Home repo, Goal conversations — and `view="cards"` takes `cards`: `settings` (the
first two), `status` (the last two), `all` (the Fleet lane beside a conversation, unchanged).
`ManageApp` renders `cards="status"` on Status and `<ManageSettings>` (placement +
`cards="settings"`) on Settings. `readOrder` slots the new tab after Status on devices that
saved an order without it.

## D5. Out of scope, named

A companion Chrome extension that opens per-agent tabs in a chosen existing window
(`chrome.windows.getAll` → `chrome.tabs.create({ windowId })`), driven by the dashboard
through `externally_connectable` — the only way to "put a tab into that window".
