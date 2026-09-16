# Design — kanban-worker-window

## D1. The research, in full (browser named-target semantics)

Question: can a management page (M) hold ONE worker window (W) and point it at
a different machine's harness on every click?

Mechanism under test: the HTML spec's *browsing context name* rule. When a page
calls `window.open(url, name)` and a non-`_blank` `name` matches an auxiliary
browsing context that this context is "familiar with" (i.e. one it opened),
the browser does **not** create a new window — it **navigates the existing one**
to `url`. Three properties matter for this feature and were verified against a
real engine (Edge/Chromium via Playwright, real button clicks, three distinct
`127.0.0.1:<port>` origins) in
`.claudeweb-preview/playwright/check-worker-window.mjs`:

```
PASS  first click opens ONE worker window at machine A
PASS  second click REUSES that window, navigated cross-origin to machine B
PASS  third click: still the same single worker window (back at A)
PASS  after M reloads, a click still yields at most one extra window
INFO  after reloading M: named-target association SURVIVES (same worker reused)
4/4
```

1. **Reuse**: subsequent `window.open(url2, 'birocode-worker')` calls navigate
   the same window; the page count never grows past M + one worker.
2. **Cross-origin renavigation**: navigating W from origin A to origin B works —
   the opener may always *navigate* a window it opened; it only cannot *script*
   its cross-origin content (which we don't need).
3. **Reload resilience**: the name association survives M reloading (the opener
   browsing context persists), so a refreshed dashboard re-adopts the same W.

Popup-blocker: satisfied by calling from a click handler (a user gesture) —
which the card button is. Focus: `focus()` is one of the few cross-origin-
allowed operations on the returned handle and is called; whether the OS window
is actually raised is at the browser's discretion (Chromium generally raises a
separate popup window, and may only highlight a background *tab*). That is the
single soft spot, and it does not break the requirement: the worker always
*shows the right harness*, and there is only ever one of it.

The Operator's instinct ("Chrome can't retarget an already-open tab from
another tab") is correct for **unrelated** tabs — window names are no longer
matched globally across unrelated contexts (a deliberate browser change years
ago). It does not apply here because M itself opens W, making W a named
auxiliary context of M.

## D2. Why not WinForms (and what it would have been)

Since the pure-web path meets the brief (one reused surface, correct machine +
agent, no window pile-up), the native app is not built. For the record, the
fallback design was: one WinForms host with two `WebView2` forms — M loads the
management dashboard, W holds a `TabControl` of WebView2s (one per machine); M's
page posts `{machineHarnessUrl, repoId}` via
`window.chrome.webview.postMessage`, the host receives `WebMessageReceived`,
selects/creates W's tab and calls `CoreWebView2.Navigate` — host-relayed
messaging being exactly the thing unrelated browser tabs cannot do. Grounds to
revisit: only if per-machine *tabs* inside W (rather than one navigating
window) or guaranteed window-raising become hard requirements.

## D3. The deep link (the dependency the brief names)

A worker URL must open *that exact repo agent*, so the harness gains
`/studio?agent=<ref>`: on load, once the dock tab list and the repo list are
both known, `DockContext` resolves `<ref>` — exact repo **id** first, then
this harness's **handle**, then **name** (case-insensitive) — activates the
existing dock tab for that repo or opens one (`openTab`, which also selects
the project), and then **consumes** the param via `history.replaceState` so a
refresh or back-navigation doesn't re-steer the tab. Unknown refs do nothing
beyond stripping the param. The link builder sends the **target machine's own
repoId** (fleet status reports each remote agent's local repoId), so the exact-
id branch is the one that fires in practice.

## D4. The link and the button

`agentWorkerHref(machine, root, agent)` composes `harnessHref(machine, root)` —
the Fleet Status "open harness" base: the peer registry's normalized address
for remotes, this harness's root (proxy-prefix aware) for self — with
`/studio?agent=…`. Null when either half is unknown; the card simply shows no
button (never a guessed or broken href). `harnessRootFromLocation()` derives
the proxy prefix from the page's own pathname (same heuristic as ManageApp's
`harnessRoot`), so the board needs no threaded prop and behaves in both mounts
(main app Ideas tab, Management App pane).

`openInWorker(url)` in shared `workerWindow.js` is the single place the window
name lives (`birocode-worker`); the Kanban assignee chip renders a quiet ⧉
button per assignee (multi-assignee cards: one per assignee, each to its own
machine), `stopPropagation` so the card doesn't toggle open.

## Testing

Pure: `agentWorkerHref` (remote/self/prefix/encoding/nulls) and
`harnessRootFromLocation` in `harnessLink.test.mjs`. Engine truth: the
research script (run out-of-repo with `playwright-core` + the installed Edge —
playwright is not vendored in this repo; instructions in the script header).
The deep-link resolution is exercised through the existing dock flows it
reuses (`openTab`/active-tab selection).
