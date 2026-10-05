# Claude in Chrome through this Harness — agent + operator guide

Agent-agnostic doc (like `docs/understanding-app-convention.md` /
`docs/local-exposure-convention.md`): any agent on this box can read it off disk.
If the convention changes, change it HERE.

## What this is

The Harness's chat has a per-device **browser mode** toggle (🌐, Advanced UI, builder
lane only). While it is on, every builder-lane turn is spawned with `--chrome`, which
surfaces the Claude in Chrome extension as the **`claude-in-chrome` MCP server**
inside the run: the agent can open tabs, read pages, click, and type — in the
**Operator's real Chrome profile** (live cookies, SSO, MFA, password manager).

Requirements — the whole chain, each link checked by the status strip's **Chrome**
section (openspec `chrome-readiness-preflight`; `GET /api/chrome/preflight`):

1. Google Chrome installed **and running**.
2. The Claude extension (`fcoeoabgfenejglbffodgkkbkcdhcgfn`, ≥ 1.0.36) installed and
   enabled **in the profile that is open** — it is per profile.
3. The native-messaging registration:
   `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.anthropic.claude_code_browser_extension`
   → a manifest → `chrome-native-host.bat` → `claude.exe --chrome-native-host`. Written
   by `claude --chrome`; Chrome reads it at startup.
4. A transport to the extension — either is enough: the **local host** (the extension
   starts it; it opens the pipe `claude-mcp-browser-bridge-<user>`) or the extension's
   **cloud connection**. Verified: with the local host stopped a turn still got through;
   the extension does not restart the host by itself. When neither answers, every browser
   call says *"Browser extension is not connected"*.
5. Claude CLI with `--chrome`.
6. Claude Code on its **claude.ai login**. With an API key or a long-lived token
   (`CLAUDE_CODE_OAUTH_TOKEN`) the CLI keeps Chrome integration **off even with
   `--chrome`**, silently — the tools are just not there. The Harness removes
   `ANTHROPIC_API_KEY` from every CLI spawn, and **every** authentication override from a
   browser turn when a claude.ai login exists.
7. The extension signed in to claude.ai **with the same account** as Claude Code. Not
   visible from the Harness; only a live answer proves it.

"Installed" is not "usable": the section is **Ready** only after a live proof — its
Re-run button runs one short real agent turn with `--chrome` that calls two read-only
browser tools — or after a real agent browser call answered. `GET /api/chrome/status`
still reports the two host-side signals plus the gate's holder.

### What the Harness repairs by itself

- **Before every browser turn** it re-reads the checks and, when Chrome is closed, the
  local host is down or the open profile lacks the extension, opens the extension's own
  reconnect address (`https://clau.de/chrome/reconnect`) in the profile that has the
  extension. That starts Chrome if needed, makes the extension re-dial, and the tab closes
  itself.
- **When a browser call answers "not connected"** it does the same at once.
- **Repair** in the Chrome section also has Claude Code rewrite a broken registration and
  then runs the live probe as the proof.
- It never restarts Chrome, enables or installs an extension, or signs anyone in. For
  those the section opens the right page in the right profile and the Operator finishes;
  the chat says so when the turn starts.

## Rules for an agent driving the browser

1. **Address pages by URL, never by remembered tab.** Your tab group is negotiated
   per session; tabIds are only meaningful inside your own group during your own
   session and do not survive a browser restart. Navigate to the URL you want; the
   shared profile means you land already authenticated.
2. **Your world is one tab group.** `tabs_context_mcp` shows the only tabs you can
   touch. The Operator's other tabs are not enumerable and every tool call validates
   its `tabId` against your group. The sanctioned handoff is the Operator dragging a
   tab into (or out of) your group.
3. **Window placement is the Operator's, not yours.** Group creation may open a new
   window; there is no windowId API. Don't fight it — the Operator drags the group
   where they want it. `resize_window` is the only window call that exists; use it at
   session start if you need a deterministic viewport.
4. **One holder of the pipe.** The native-messaging pipe is single-holder; the
   Harness serializes browser-enabled runs globally (second one gets a 409 naming
   the holder). Never spawn your own parallel `claude --chrome` sub-processes.
5. **Batches: every step needs `tabId`, and coordinates in a batch refer to the
   pre-batch screenshot.** Re-screenshot after anything that changes layout.
6. **Login walls / CAPTCHAs stop you.** The extension expects a human at the
   browser; through this Harness that human may be on their phone, away from the
   host. Say what you're blocked on in chat and continue when the page is usable —
   don't spin. Prefer targets the profile is already authenticated to.
7. **You act as the Operator.** Reading is cheap; state-changing actions (send,
   submit, approve, buy) deserve the same care as a `git push` — confirm in chat
   when the user's instruction didn't explicitly cover the action.
8. **Idle death is normal — retry once.** The extension's service worker can go idle
   between turns. If a browser call answers *"Browser extension is not connected"*, the
   Harness has already asked the extension to reconnect: wait about five seconds and
   repeat the call **once**. If it fails again, stop and tell the user — the status
   strip's Chrome section names the reason; do not loop. Fresh turns are fresh `-p`
   processes — expect to re-establish tab context each turn, not to find last turn's
   tabs by id (see rule 1).

## Where this is NOT the right tool

Headless/CI, parallel scraping, deterministic re-runs, request mocking: use
Playwright (or chrome-devtools-mcp over CDP against a Chrome you launched with
`--remote-debugging-port`). Rough rule: the extension for the Operator's logged-in
life and exploratory one-offs; Playwright for anything you'll run a thousand times.

## Open behavior note (update when observed)

Whether a resumed turn (`--resume` + `--chrome`) re-attaches to the session's
previous tab group or negotiates a new group (⇒ possibly a new window) has not yet
been observed live on this box. First Operator-watched session should record the
answer here.
