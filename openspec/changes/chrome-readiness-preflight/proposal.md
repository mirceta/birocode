# Status strip: is this machine ready for Claude for Chrome?

Fleet task `20f936ec97694270841c02920815cf35` (Operator, 2026-10-05).

## Why

Chrome use for repo agents "simply does not work" on many occasions although it is switched
on, and nothing shows why. The harness's only signal (`GET /api/chrome/status`) said
"available" when a registry key existed and the CLI knew `--chrome` — two of at least nine
links, neither of which is the one that usually breaks.

## What was investigated (not guessed)

- **How the harness turns it on**: a per-agent 🌐 toggle (client `localStorage`) makes a
  builder-lane turn on the Claude engine send `browser: true`; `ClaudeCliAdapter` adds
  `--chrome`, and removes `ANTHROPIC_API_KEY` from the spawn.
- **The real mechanism** (official docs, `code.claude.com/docs/en/chrome`, and this machine):
  Chrome reads a native-messaging registration (`HKCU\Software\Google\Chrome\NativeMessagingHosts\
  com.anthropic.claude_code_browser_extension` → a manifest → `chrome-native-host.bat` →
  `claude.exe --chrome-native-host`); the **extension** starts that host, which opens the named
  pipe `claude-mcp-browser-bridge-<user>`; a `--chrome` turn's in-process `claude-in-chrome`
  MCP server connects to it. The extension must be signed in to claude.ai **with the same
  account** as Claude Code, and Claude Code must be using its claude.ai login — with an API
  key or a long-lived token it keeps Chrome integration off even when `--chrome` is passed.
- **Real failures on this machine**: the pers-dec agent's transcript holds 21 browser calls that
  answered *"Browser extension is not connected…"* (2 Sep – 4 Sep and later). And reproduced
  live: with `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) in the environment, a `--chrome`
  turn starts normally, lists **no** `claude-in-chrome` server and **zero** browser tools, and
  says nothing. The harness strips only `ANTHROPIC_API_KEY`.
- **What "connected" does not mean**: the turn's init reports the `claude-in-chrome` server as
  `connected` whether or not the extension is reachable; only a tool call tells.

## What changes

- A **Chrome** section in the header status strip: one overall state — ready / degraded /
  not ready — expandable into the checks, each with pass / fail / warning / "cannot be checked",
  the concrete reason and what to do. Failures are listed first.
- **Static checks** from a cached snapshot (30 s, renewed in the background, **no process is
  started**): Chrome installed and running; the extension installed, enabled and new enough, and
  in which profile; the native-messaging registration down to the binary it starts; the bridge
  pipe; the CLI and `--chrome`; the login type and any auth variable that would switch Chrome off;
  the harness's own browser gate.
- **A passive check**: what real agent browser calls on this harness last answered.
- **A live probe**, only on **Re-run**: one short real agent turn with `--chrome`, launched the
  way an agent's turn is, calling two read-only browser tools. It opens no tab.
- **Honesty**: the extension's sign-in cannot be seen from the harness and is shown as "?" until
  a live answer proves it; ready requires a live proof, not files.

## Repair (second part of the same change)

Diagnosis alone still leaves the Operator fixing the same things by hand. Experiments on the
real Chrome showed which repairs actually work (see `design.md` §2 and §4):

- **Before every browser turn** the harness re-reads the checks and, when Chrome is closed, the
  extension's local host is down or the open profile lacks the extension, opens the extension's
  own reconnect address in the right profile — the local host was back in 1.6 s in the live test.
- **When a real agent browser call answers "not connected"** it does the same at once.
- **A browser turn no longer inherits authentication overrides** (`CLAUDE_CODE_OAUTH_TOKEN` and
  the like) when a claude.ai login exists — the case that silently removed the browser tools.
- **Repair** in the section: rewrite a broken registration (a `--chrome` CLI run does it),
  reconnect, then the live probe as the proof. A repair log shows what was done and why.
- What only the Operator can fix — extension disabled, missing, signed out — gets an **Open …**
  button that opens the right page in the right profile on the host, and a notice in the chat
  when a browser turn starts. The harness never restarts Chrome or changes anything inside it.
- A correction to the first part: **a missing local-host pipe is a warning, not a failure** —
  with the host stopped a turn still got through over the extension's cloud connection.

## Not changed

The single-holder browser gate (the probe and Repair take it like a turn), the 🌐 toggle's
meaning, and `GET /api/chrome/status`.
