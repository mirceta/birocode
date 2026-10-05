## 1. Investigate

- [x] 1.1 How the harness turns Chrome on: per-agent 🌐 toggle → `browser: true` → `ChromeGateService` → `--chrome`, `ANTHROPIC_API_KEY` stripped
- [x] 1.2 The official mechanism and requirements (`code.claude.com/docs/en/chrome`) and the same chain on this machine: registry → manifest → wrapper → `claude.exe --chrome-native-host` → pipe → extension
- [x] 1.3 Three hand-run probes: init says `connected` regardless; two read-only tools prove reach; API key / token auth silently drops the tools
- [x] 1.4 Real failures: 21 "Browser extension is not connected" results in the pers-dec transcript; the token-auth case reproduced through the harness's spawn path

## 2. Server

- [x] 2.1 `ChromePreflightRules` — pure: facts → checks → overall; probe stream parsing; extension entry, host manifest, wrapper, version parsing
- [x] 2.2 `ChromePreflightService` — static facts without starting a process, 30 s cache with background renewal, first read answers "checking"; the live probe on demand under the browser gate
- [x] 2.3 `ChromeTurnObserver` — the adapter reports real `claude-in-chrome` tool calls and results
- [x] 2.4 `GET /api/chrome/preflight`, `POST /api/chrome/preflight/run`

## 3. Client

- [x] 3.1 `ChromeReadinessTile` in the header strip (feature `chromeReadiness`, Advanced): overall dot + label + counts, expandable checks (failures first), reason and "Do:", Re-run, what cannot be checked
- [x] 3.2 `chromeReadiness.js` pure helpers + tests; strings in `en.json` / `tr.json`

## 4. Verify on this machine, against the real Chrome

- [x] 4.1 Healthy: degraded before a proof → Re-run → live probe passes in ~10–20 s → **Ready**; polled GET 1–2 ms
- [x] 4.2 Failure: harness started with `CLAUDE_CODE_OAUTH_TOKEN` → **Not ready**, login check + live probe both name the cause
- [x] 4.3 .NET tests 775 (new `ChromePreflightTests`), client tests 189
- [x] 4.4 `openspec validate chrome-readiness-preflight --strict`
- [x] 4.5 `docs/claude-in-chrome.md` updated; Understanding app (`understanding-app/`)

## 5. Not in this change

- [ ] 5.1 Strip `CLAUDE_CODE_OAUTH_TOKEN` and the other auth overrides from agent spawns, or refuse browser turns while one is set (the section reports it; changing the spawn is its own decision)
- [ ] 5.2 Revisit the single-holder browser gate: two `--chrome` turns at once both answered on CLI 2.1.289
- [ ] 5.3 Static checks for macOS / Linux peers
