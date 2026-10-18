# Design — harness-tabs-left-window

## What a web page can and cannot control (measured, real Chrome)

| | can a normal page do it? |
|---|---|
| list Chrome's windows, or put a tab into a window it is not in | **no** (an extension's `chrome.windows` / `chrome.tabs` power) |
| choose the window of a tab it opens | **no**: a tab always lands in the window of the page that called `window.open` |
| make a new normal window | **no**: any position/size feature makes a *popup* window, which cannot hold tabs |
| find a tab by name | only inside its own browsing-context group: lost after a reload through an error page, never for a tab opened by hand |
| open a tab with no click of its own | only with "Pop-ups: allow" for the site (remembered across restarts) |
| bring another tab to the front | only from a page holding the user's click, via `window.open('', name)` of a tab in its group |
| talk to every same-origin page of the profile | **yes**: `BroadcastChannel`, whatever opened them and however often they reloaded |

Hence: a page **in** the left window (the host) must do the opening, and the dashboard must reach it by
something that survives reloads: the channel.

## Options weighed

| option | survives dashboard refresh | harness restart / error page | Chrome restart | install / upkeep | verdict |
|---|---|---|---|---|---|
| (a) re-acquire the named launcher (`window.open('', name)`) + heal | F5 yes | **no** (group replaced) | no | none | the earlier design; its failure is the bug |
| (b) BroadcastChannel host tab in the left window | **yes** | **yes** | host comes back with "Continue where you left off", else one placement step | pop-ups allowed once | **chosen** |
| (c) a Chrome extension (`chrome.windows` / `chrome.tabs`) | yes | yes | yes | load-unpacked per Chrome, developer mode, a content-script bridge that every page could drive, versioning | deterministic raise, but a second product to install, secure and maintain on every machine |
| (d) WinForms / OS-level window placement | yes | yes | yes | Windows only, the harness would drive the Operator's browser | rejected by the Operator earlier ("not through Windows") |

(b) makes placement deterministic with no install. The single thing it cannot guarantee is **raising** an
existing tab when Chrome has severed the dashboard's group from the host's. The tab is still switched to the
agent in the left window, and the toast says it was not brought to the front. That gap does not justify making
(c) mandatory; it stays the documented upgrade if the Operator wants a raise every time.

## Protocol (channel `birocode-harness-host`)

| message | from → to | payload |
|---|---|---|
| `hello` | dashboard → all | `reqId` |
| `host` | host → dashboard | `reqId, hostId, rect {x,y,w,h}, since` |
| `open` | dashboard → host | `reqId, hostId, name, url, label, queue, dash rect` |
| `result` | host → dashboard | `reqId, result: opened / focused / queued / blocked` |

**Window guard:** `sameWindow(rectA, rectB)` = every tab of one Chrome window reports the same `screenX/Y`
and `outerWidth/Height` (2 px slack). `pickHost` takes the newest host outside the dashboard's window, else one
inside it to queue on.

## State machine of a click

```
click ─► roll call (350 ms)
          ├─ host outside dashboard window ─► open ─► opened | focused (+ dashboard raise by name) | steered | blocked
          ├─ host only inside dashboard window ─► queue ─► "drag it left" (host opens the queue once moved)
          └─ no host ─► open host beside dashboard with #open=<agent> ─► "one-time setup" toast
                         └─ an older host answers from another window ─► hand the queue over, close self
```

## Edge cases

- **Pop-ups blocked:** the host keeps the agent as a button ("open here"). Its click carries activation. The
  toast says to allow pop-ups once.
- **Host asleep (Memory Saver):** no answer, so a new host is created (safe: it only queues). When the old one
  wakes, it takes the queue over. The Settings tab suggests "Always keep these sites active".
- **Chrome restart:** with session restore the host returns, and agent tabs restored by Chrome are unknown to it
  by name, so the first click per agent opens one fresh tab. Without restore, the first click opens a host to
  place once.
- **Several dashboards / origins:** the channel is per origin, so localhost and the LAN address each need their
  own host.
- **Re-click right after opening a slow remote tab:** a cross-origin tab finishing its first load can take the
  front back. Seen once in the lab, not on settled tabs (3/3 runs).

## Test evidence

- `client/src/components/shared/harnessHost.test.mjs`: 12 node tests on a fake browser (one channel bus,
  windows with rectangles, browsing-context groups): placement, guard, pick, URL, three agents left, refresh,
  no host → queue → drag, pop-ups blocked, hand-over, raise vs steer across F5 / error-page reload.
- `.claudeweb-preview/leftwin/leftwin.mjs`: **real Chrome** on the hub, two windows, local + remote harnesses
  (lab.ps1), 29/29.
- `.claudeweb-preview/leftwin/leftwin-drag.mjs`: the drag flow with a test-only tab-move extension and
  `chrome.tabs` as ground truth for "raised", 10/10 (3 consecutive runs).
