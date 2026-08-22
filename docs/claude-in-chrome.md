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

Requirements (all verified before shipping this): Claude CLI with `--chrome`
(≥ 2.1.235 on this box), the extension's native-messaging host registered
(`com.anthropic.claude_code_browser_extension` under
`HKCU\Software\Google\Chrome\NativeMessagingHosts`), and **subscription auth** — the
Harness already strips `ANTHROPIC_API_KEY` from every CLI spawn, which is exactly
what `--chrome` needs (API-key auth silently disables the integration).
`GET /api/chrome/status` reports these signals plus pipe busy-state.

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
8. **Idle death is normal.** The extension's service worker can go idle between
   turns; a first tool call after a pause may need a retry. Fresh turns are fresh
   `-p` processes — expect to re-establish tab context each turn, not to find last
   turn's tabs by id (see rule 1).

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
