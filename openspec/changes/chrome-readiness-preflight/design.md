# Design — the chain, the checks, and what was verified on the hub

Fleet task `20f936ec97694270841c02920815cf35`. Verified on DESKTOP-POAPPP3 against the real
Chrome 154, extension 1.0.98, Claude Code 2.1.289 (Max login), 2026-10-05.

## 1. The chain as it really is

```
agent's 🌐 toggle (per agent, this device)          client localStorage
   └─ builder lane + Claude engine ──► POST /api/chat { browser: true }
        └─ ChromeGateService (one browser turn at a time)
             └─ claude -p … --chrome        (ANTHROPIC_API_KEY removed, the rest inherited)
                  └─ in-process MCP server "claude-in-chrome"  (22 tools)
                       └─ named pipe  \\.\pipe\claude-mcp-browser-bridge-<user>
                            └─ claude.exe --chrome-native-host      ◄── started BY Chrome
                                 ▲  chrome-native-host.bat ◄ manifest ◄ HKCU\…\NativeMessagingHosts\
                                 │                                       com.anthropic.claude_code_browser_extension
                                 └─ the Claude extension (fcoeoabg…) in ONE Chrome profile,
                                    signed in to claude.ai with the SAME account as Claude Code
```

Every break below the CLI reads identically to the agent: *"Browser extension is not
connected. Please ensure the Claude browser extension is installed and running …, and that you
are logged into claude.ai with the same account as Claude Code."* A break at the CLI's login
reads as nothing at all — the tools are just not there.

## 2. What was found on this machine

| Link | Found |
|---|---|
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` 154.0.8037.97, running |
| Profiles | two; the extension (1.0.98, enabled) is in one of them only |
| Registration | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.anthropic.claude_code_browser_extension` → `%APPDATA%\Claude Code\ChromeNativeHost\….json` → `~\.claude\chrome\chrome-native-host.bat` → `~\.local\bin\claude.exe --chrome-native-host`; `allowed_origins` = the extension. Not registered for Edge |
| Bridge | pipe `claude-mcp-browser-bridge-km` present; `chrome.exe → cmd.exe → claude.exe --chrome-native-host`, started with Chrome |
| CLI | 2.1.289, lists `--chrome`; `claudeInChromeDefaultEnabled: true` |
| Login | claude.ai OAuth, Max; no API key, no token in the environment |
| Harness | strips **only** `ANTHROPIC_API_KEY` from an agent spawn |

Three probes, run by hand before any code:

1. `claude -p … --chrome`, no browser tool called: init lists `claude-in-chrome: connected`,
   22 tools. **This proves nothing** — see 3.
2. The same, calling `list_connected_browsers` and `tabs_context_mcp {}`:
   `[{"name":"Browser 1","osPlatform":"Windows","isLocal":true,…}]` and
   *"No tab group exists for this session."* — the extension answered, no tab was opened. ~10–28 s.
3. The same with `ANTHROPIC_API_KEY` set, and again with `CLAUDE_CODE_OAUTH_TOKEN` set:
   `mcp_servers: []`, **0 browser tools**, `--chrome` silently ignored.

Also observed: two `--chrome` turns at once both got answers on this CLI version, so the pipe is
no longer strictly single-holder. The harness's gate is left as it is (out of scope); the probe
takes the gate like any browser turn.

### The failure cases

- **In the wild**: the pers-dec agent's transcript has 21 browser calls answered *"Browser
  extension is not connected"* (first on 2 Sep, bursts on 3–4 Sep), between stretches where the
  same calls worked — the bridge was down (Chrome closed, the profile without the extension in
  front, or the extension's worker asleep) while browser mode was on.
- **Reproduced through the harness's own spawn path**: a lab harness started with
  `CLAUDE_CODE_OAUTH_TOKEN` in its environment. The section shows **Not ready**: the login check
  names the variable and what it does, and the live probe reports *"The turn was started with
  --chrome but was NOT offered the browser tools. … 401 Invalid bearer token"*
  (`docs/screenshots/chrome-ready-token-auth-2-after-probe.png`).

## 3. The checks

| id | What | How (no process is started) | Fails when |
|---|---|---|---|
| `chrome` | Chrome installed and running | `chrome.exe` under Program Files / LocalAppData, its file version; `Process.GetProcessesByName` | missing; not running |
| `extension` | Extension installed, enabled, ≥ 1.0.36 | each profile's `Extensions\<id>\<version>\` and its `extensions.settings.<id>` entry in `Secure Preferences` / `Preferences` (`disable_reasons`, legacy `state`) | in no profile; disabled; too old |
| `profile` | The extension is in the profile Chrome has open | `Local State` → `profile.info_cache`, `last_active_profiles` | the open profile lacks it (fail); another profile lacks it and the bridge is down (warning) |
| `nativeHost` | Native-messaging host registered | registry value → manifest exists and parses → `path` exists → the binary the wrapper starts exists → `allowed_origins` has the extension | any link of that is broken (a moved or reinstalled Claude Code) |
| `bridge` | The bridge is up now | the pipe list (`\\.\pipe\`) has `claude-mcp-browser-bridge-<user>` | the extension has not started the host |
| `cli` | Claude Code supports `--chrome` | PATH; `--help` and `--version` once per harness lifetime, in the background pass | no CLI; no `--chrome` |
| `login` | Claude Code uses the claude.ai login | the account probe; the harness's own environment for `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` (and `ANTHROPIC_API_KEY`, noted as stripped); `apiKeyHelper` in `~/.claude/settings.json` | not signed in; an unstripped override; a key helper |
| `extensionLogin` | Extension signed in with the same account | **cannot be checked from the harness** — shown "?" | never fails; turns green only when a live answer proves it |
| `harness` | Harness browser mode | the gate's holder | — (a held browser is a warning naming the holder) |
| `lastTurn` | Last real agent browser call | `ChromeTurnObserver`: the adapter reports each `claude-in-chrome` tool call and result | the newest connection-class result is a failure |
| `live` | An agent turn reaches the browser | **Re-run only**: one `claude -p --chrome` turn (haiku, two read-only tools allowed, scratch cwd, no session file), launched like an agent turn; verdict from the tool results, never from the model's words | tools not offered; "not connected"; empty browser list |

Overall: **not ready** if any check fails; **ready** if none fails, none warns, and a live proof
exists (the probe, or a real agent call that answered); otherwise **degraded**. So a machine
with every file in place and no proof yet is *degraded* — "installed" is not "usable".

## 4. Refresh — why this is not another poller that spawns processes

`GET /api/chrome/preflight` returns a cached snapshot: 2 ms median on the hub. The static pass
re-runs at most every 30 s, in the background, one at a time, and starts no process (registry,
files, the process list, the pipe list). The CLI's `--help` / `--version` are asked once per
harness lifetime, in that background pass — the very first read answers "checking". The tile
polls every 5 s with the hidden-tab guard and is unmounted while the strip is collapsed, exactly
like its neighbours. The live probe is the one thing that starts a process, and only a click does.

## 5. What cannot be checked from the harness (and is said so)

- **Which account the extension is signed in to** — it lives inside the browser; "?" until the
  probe or a real call proves it.
- **Which Chrome window is in front** — only which profiles Chrome reports as last active.
- **Site permissions** inside the extension, and a page blocked by a login wall or a dialog —
  those are per-site, not machine readiness.
- **Other operating systems** — the static checks are Windows-shaped; elsewhere the section says
  so and only the probe tells.

## 6. Choices

- **Verdict from tool results, not prose**: the probe's stream is parsed for the init server
  list and the two tool results; what the model writes is ignored.
- **Read-only probe**: `list_connected_browsers` and `tabs_context_mcp {}` (no `createIfEmpty`)
  touch no page and open no tab in the Operator's browser.
- **The probe is launched like an agent turn** — same resolved CLI, `--chrome`,
  `ANTHROPIC_API_KEY` removed, everything else inherited — so what breaks a real turn breaks it.
- **Chrome's files are read, never written**, and only the one extension's settings entry.
- **Screenshots in this change mask** the account e-mail and the profile names (the repository
  is public); the product shows them.
