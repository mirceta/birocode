## 1. Investigate

- [x] 1.1 How the harness turns Chrome on: per-agent 🌐 toggle → `browser: true` → `ChromeGateService` → `--chrome`
- [x] 1.2 The official mechanism (`code.claude.com/docs/en/chrome`) and the same chain on this machine; the extension's own code for how it connects, reconnects and what wakes it
- [x] 1.3 Hand-run probes: init says `connected` regardless; two read-only tools prove reach; API key / token auth silently drops the tools
- [x] 1.4 Experiments on the real Chrome, each restored: local host stopped (turn still passes over the cloud path; no self-recovery), the reconnect address (pipe back in < 1 s), registration deleted (a `--chrome` run rewrites it)
- [x] 1.5 Real failures: 21 "Browser extension is not connected" results in one agent's transcript

## 2. Diagnose — server

- [x] 2.1 `ChromePreflightRules` — pure: facts → checks → overall; probe stream parsing; extension entry, host manifest, wrapper, version parsing
- [x] 2.2 `ChromePreflightService` — static facts without starting a process, 30 s cache with background renewal, first read "checking"; live probe on demand under the browser gate
- [x] 2.3 `ChromeTurnObserver` — the adapter reports real `claude-in-chrome` tool calls and results
- [x] 2.4 `GET /api/chrome/preflight`, `POST /api/chrome/preflight/run`

## 3. Repair — server

- [x] 3.1 Each check carries its repair: `auto`, `open:extensions|store|signin`, or none; `RepairSteps`, `TurnBlockers`, `PreferredProfile`
- [x] 3.2 `Reconnect` — the extension's reconnect address in the right profile (also starts a closed Chrome), wait for the pipe, 20 s debounce; `RegenerateHost` — one `--chrome` CLI run
- [x] 3.3 `EnsureReadyForTurn` before every browser turn (`ChatController`); a notice in the chat for what only the Operator can fix; the turn runs either way
- [x] 3.4 Self-heal: `ChromeTurnObserver.ConnectionFailed` → reconnect at once
- [x] 3.5 `BrowserTurnStrips`: a browser turn (and the probe) does not inherit authentication overrides when a claude.ai login exists
- [x] 3.6 `POST /api/chrome/preflight/repair`, `POST /api/chrome/preflight/open`; repair log in the snapshot
- [x] 3.7 The local host's pipe missing is a repairable warning, not a failure

## 4. Client

- [x] 4.1 `ChromeReadinessTile`: overall + counts + "repairable"; checks with reason, "Do:", "the harness repairs this by itself", Open buttons; **Repair** and **Re-run**; "What the harness repaired"
- [x] 4.2 The hint beside an agent's 🌐 toggle reads the preflight: blocked / will be repaired on send
- [x] 4.3 `chromeReadiness.js` pure helpers + tests; strings in `en.json` / `tr.json`

## 5. Verify on this machine, against the real Chrome

- [x] 5.1 Healthy: Degraded → Re-run → probe passes → **Ready**; polled GET ~2 ms
- [x] 5.2 Local host stopped → *Degraded · repairable* → **Repair** → host up after 5.7 s, probe passes → **Ready**
- [x] 5.3 Local host stopped → a real browser chat turn → repaired before the turn (1.6 s), turn completes
- [x] 5.4 Harness started with `CLAUDE_CODE_OAUTH_TOKEN` → the probe passes (it had zero tools before) → **Ready**
- [x] 5.5 .NET tests (new `ChromePreflightTests`), client tests; `openspec validate chrome-readiness-preflight --strict`
- [x] 5.6 `docs/claude-in-chrome.md` updated; Understanding app (`understanding-app/`)

## 6. Not in this change

- [ ] 6.1 Starting a closed Chrome and the mid-turn self-heal are implemented and unit-tested but not exercised live (they need the Operator's Chrome closed / both transports down)
- [ ] 6.2 Restarting Chrome is never done by the harness; whether to offer it behind a confirmation is the Operator's call
- [ ] 6.3 Revisit the single-holder browser gate: two `--chrome` turns at once both answered on CLI 2.1.289
- [ ] 6.4 Static checks and repairs for macOS / Linux peers; readiness per fleet machine for the arch
