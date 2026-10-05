# Design — the chain, the checks, the repairs, and what was verified on the hub

Fleet task `20f936ec97694270841c02920815cf35`. Verified on DESKTOP-POAPPP3 against the real
Chrome 154, extension 1.0.98, Claude Code 2.1.289 (Max login), 2026-10-05/06.

## 1. The chain as it really is

```
agent's 🌐 toggle (per agent, this device)          client localStorage
   └─ builder lane + Claude engine ──► POST /api/chat { browser: true }
        └─ ChromeGateService (one browser turn at a time)
             └─ harness: re-read the checks, REPAIR what it can            ◄── new
                  └─ claude -p … --chrome        (auth overrides removed)  ◄── new
                       └─ in-process MCP server "claude-in-chrome"  (22 tools)
                            ├─ A. local:  pipe \\.\pipe\claude-mcp-browser-bridge-<user>
                            │      └─ claude.exe --chrome-native-host   ◄── started BY Chrome, from
                            │           HKCU\…\Chrome\NativeMessagingHosts\com.anthropic.claude_code_browser_extension
                            │           → manifest → chrome-native-host.bat
                            └─ B. cloud:  wss://bridge.claudeusercontent.com   (the extension's own socket)
                                 └─ the Claude extension (fcoeoabg…) in ONE Chrome profile,
                                    signed in to claude.ai with the SAME account as Claude Code
```

Either transport is enough. When neither answers, the agent reads *"Browser extension is not
connected. Please ensure the Claude browser extension is installed and running …, and that you
are logged into claude.ai with the same account as Claude Code."* A break at the CLI's login
reads as nothing at all — the browser tools are just not there.

## 2. What was found on this machine

| Link | Found |
|---|---|
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` 154.0.8037.97, running |
| Profiles | two; the extension (1.0.98, enabled) is in one of them only |
| Registration | registry value → `%APPDATA%\Claude Code\ChromeNativeHost\….json` → `~\.claude\chrome\chrome-native-host.bat` → `~\.local\bin\claude.exe --chrome-native-host`. Not registered for Edge |
| Local host | pipe present; `chrome.exe → cmd.exe → claude.exe --chrome-native-host`, started with Chrome |
| CLI | 2.1.289, lists `--chrome`; `claudeInChromeDefaultEnabled: true` |
| Login | claude.ai OAuth, Max; no API key, no token in the environment |
| Harness | stripped **only** `ANTHROPIC_API_KEY` from an agent spawn |

### Experiments on the real Chrome (each restored afterwards)

1. `claude -p … --chrome`, no browser tool called: init lists `claude-in-chrome: connected`,
   22 tools. **This proves nothing** — it says the same in every case below.
2. Calling `list_connected_browsers` and `tabs_context_mcp {}`:
   `[{"name":"Browser 1","osPlatform":"Windows","isLocal":true,…}]` and *"No tab group exists for
   this session."* — the extension answered, no tab was opened. 6–28 s.
3. With `ANTHROPIC_API_KEY` set, and again with `CLAUDE_CODE_OAUTH_TOKEN` set:
   `mcp_servers: []`, **0 browser tools**, `--chrome` silently ignored.
4. **Local host stopped** (the `claude.exe --chrome-native-host` process killed; the pipe gone):
   the same probe **still passed** — the turn went over the extension's cloud connection. The
   pipe did **not** come back in 60 s: outside managed installs the extension does not re-dial
   its host (its code arms the reconnect backoff only when `managed`).
5. **The extension's reconnect address**: the service worker listens for a tab navigating to
   `https://clau.de/chrome/reconnect`, drops and re-dials both the native host and the cloud
   socket, and closes the tab. Opened with `chrome.exe --profile-directory=<profile> <url>`:
   the pipe was back in **under a second** with a new host process.
6. **Registration deleted** (the registry value, backed up first): one `--chrome` run of the CLI
   **rewrote it**, identical to before.
7. Two `--chrome` turns at once both got answers, so the pipe is no longer strictly
   single-holder on this CLI version. The harness's gate is left as it is.

### The failure cases

- **In the wild**: the pers-dec agent's transcript has 21 browser calls answered *"Browser
  extension is not connected"* (first on 2 Sep, bursts on 3–4 Sep), between stretches where the
  same calls worked — both transports were down while browser mode was on.
- **Token in the harness's environment** (`CLAUDE_CODE_OAUTH_TOKEN`): a `--chrome` turn lost its
  browser tools without a word. Reproduced through a lab harness's own spawn path — and now
  **repaired at the spawn**: the same lab harness ends *Ready*.

## 3. The checks

| id | What | How (no process is started) | State when wrong | Repair |
|---|---|---|---|---|
| `chrome` | Chrome installed and running | `chrome.exe` + version; process list | fail | **auto** — the harness starts it |
| `extension` | Extension installed, enabled, ≥ 1.0.36 | each profile's `Extensions\<id>` folder and its settings entry | fail | **open** the extension's page / its store page on the host's Chrome |
| `profile` | The extension is in the profile Chrome has open | `Local State`: profiles, last active | fail if the open one lacks it; warning if another lacks it and the local host is down | **auto** — opens the profile that has it |
| `nativeHost` | Native-messaging host registered | registry → manifest → wrapper → binary → allowed origin | fail | **auto** — a `--chrome` CLI run rewrites it |
| `bridge` | The local host is up | the pipe list | **warning** (the cloud path may still serve); fail when Chrome is closed | **auto** — the reconnect address |
| `cli` | Claude Code supports `--chrome` | PATH; `--help` / `--version` once per harness lifetime | fail | Operator |
| `login` | Claude Code on its claude.ai login | account probe; auth overrides in the harness's environment; `apiKeyHelper` | fail when not signed in; overrides are **removed from browser turns** and only noted | at the spawn |
| `extensionLogin` | Extension signed in with the same account | **cannot be checked from the harness** — "?" | — | **open** claude.ai's Chrome page; green once a live answer proves it |
| `harness` | Harness browser mode | the gate's holder | warning naming the holder | — |
| `lastTurn` | Last real agent browser call | `ChromeTurnObserver` | fail when the newest connection-class result failed | triggers a reconnect at once |
| `live` | An agent turn reaches the browser | Re-run / Repair: one `claude -p --chrome` turn, two read-only tools, verdict from the tool results | fail | — |

Overall: **not ready** if any check fails; **ready** if none fails, none warns, and a live proof
exists; otherwise **degraded**. Every file in place and no proof yet is *degraded*.

## 4. Repair

Three triggers, no timer:

| Trigger | What runs |
|---|---|
| **Before every browser turn** (`ChatController` → `EnsureReadyForTurn`) | re-read the facts (no process); if Chrome is closed, the local host is down or the open profile lacks the extension → open the reconnect address in the right profile and wait up to 10 s (25 s on a cold start) for the pipe. If something only the Operator can fix remains, the chat is told so up front. The turn runs either way — a browser-mode agent often needs no browser. |
| **A real agent browser call answers "not connected"** (`ChromeTurnObserver.ConnectionFailed`) | the reconnect address, at once, so the agent's retry finds the browser |
| **Repair** in the section | rewrite a broken registration (one tiny `--chrome` turn), reconnect, then the live probe as the proof |

And one repair that needs no trigger: **a browser turn does not inherit authentication
overrides** (`BrowserTurnStrips`) when a claude.ai login exists — `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_AUTH_TOKEN`, the Bedrock / Vertex / Foundry switches, besides `ANTHROPIC_API_KEY`.
Without a claude.ai login nothing more is removed (it would take the turn's only credential),
and the login check fails naming the cause.

What the harness will not do: restart Chrome, enable or install an extension, sign anyone in, or
change anything inside the browser. For those it **opens the right page in the right profile**
(`chrome://extensions/?id=…`, the Web Store page, claude.ai's Chrome page) and the Operator
finishes. A reconnect is sent only when something is wrong — it makes the extension drop its
connections for a moment — and at most once per 20 s. Every repair is listed in the section
("What the harness repaired") and logged as `[CHROME] repair (…)`.

### Verified end to end (lab harness, the real Chrome)

| Case | Result |
|---|---|
| Local host stopped → section | *Degraded · repairable*, the bridge check carries "the harness repairs this by itself" |
| → **Repair** | reconnect: local host up after 5.7 s; live probe passed; **Ready**; one row in the repair log |
| Local host stopped → a **real browser chat turn** sent through the harness | repair log: "Asked the extension to reconnect … up after 1.6 s (before a browser turn of …)"; the turn completed, no notice |
| Harness started with `CLAUDE_CODE_OAUTH_TOKEN` | login check passes with the note; live probe **passed** (it failed with zero tools before); **Ready** |
| Registration deleted → a `--chrome` run | rewritten, identical (by hand, §2.6) |

Not verified live, and said so: **starting a closed Chrome** (it would mean closing the
Operator's browser; the launch is the same command as the reconnect) and the **mid-turn
self-heal** (it needs both transports down at once; its rule is unit-tested).

## 5. Refresh — no poller that spawns processes

`GET /api/chrome/preflight` returns a cached snapshot (2 ms median on the hub). The static pass
re-runs at most every 30 s, in the background, and starts no process. The CLI's `--help` /
`--version` are asked once per harness lifetime, in that pass; the first read answers
"checking". The tile polls every 5 s with the hidden-tab guard and is unmounted while the strip
is collapsed. Processes are started only by: the live probe (a click), Repair (a click), and a
repair before a browser turn that needs one (Chrome's own launcher, once).

The hint beside an agent's 🌐 toggle reads the same cached endpoint (once when the toggle is
turned on, then every 30 s while it stays on; identical requests from several docks coalesce):
"⚠ Chrome is not ready: …" for what only the Operator can fix, "🔧 … — will be repaired on
send" for what the harness fixes.

## 6. What cannot be checked from the harness (and is said so)

- **Which account the extension is signed in to** — "?" until the probe or a real call proves it.
- **The extension's cloud connection** — invisible from outside; the probe exercises it.
- **Which Chrome window is in front** — only which profiles Chrome reports as last active.
- **Site permissions**, login walls, blocking dialogs — per site, not machine readiness.
- **Other operating systems** — the static checks are Windows-shaped; elsewhere the section says
  so and only the probe tells.

## 7. Choices

- **Verdict from tool results, not prose**; a read-only probe that opens no tab.
- **The probe is launched like an agent turn** — same CLI, `--chrome`, the same variables
  removed — so what breaks a real turn breaks it.
- **The extension's own reconnect address** rather than restarting Chrome or touching its files:
  it is the documented "/chrome → Reconnect extension", it cleans up after itself, and it is the
  only thing the experiments showed bringing the local host back.
- **A missing pipe is a warning, not a failure**: experiment 4. Calling it a failure would have
  shown "Not ready" on a machine whose agents were getting through.
- **A notice, not a refusal**: a browser-mode agent asked to fix code should not be refused
  because Chrome is closed.
- **Chrome's files are read, never written.**
- **Screenshots in this change mask** the account e-mail and the profile names (the repository
  is public); the product shows them.
