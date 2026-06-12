# Terminal tab — interactive PowerShell (and interactive Claude) in the browser

> **Status (2026-06-11):** Deployed and confirmed. Live on the :5099 harness
> (backend + frontend swapped together, rollback disarmed), browser-verified
> (`.claudeweb-preview/playwright/verify-terminal-tab.mjs`, 11/11 checks) and
> confirmed working by the End User. PR: #7.

## Problem

The Chat tab drives Claude through one-shot CLI runs. There is no way to use
Claude's *interactive* mode (or any console tool) from the phone. The Screen
tab can only watch the desktop — it cannot type.

## Design

A new **Terminal** tab: the backend owns a real PowerShell attached to a
Windows pseudo-console (**ConPTY**, Server 2019+); the frontend renders its
raw ANSI output with **xterm.js** and offers a chat-style composer plus a
special-key row for input. Inside it the user can run `claude` interactively
— Claude's Ink TUI requires a PTY, which is exactly what ConPTY provides.

Explicitly NOT the Screen-tab approach (window snapshots + synthetic
keystrokes): image polling is heavy on a phone and input injection into a
desktop window is fragile. ConPTY gives a clean byte stream both ways.

### Session model (mirrors detached runs)

One terminal per repo, owned by `TerminalSessionService` (singleton), cwd =
repo root. Sessions survive client disconnects; the PowerShell dies only on
explicit kill, process exit, or app shutdown. Output chunks are buffered in a
byte-capped ring buffer (~2 MB) and broadcast to attached SSE clients.

**Reattach strategy:** on every (re)connect the client resets its xterm and
the server replays the whole surviving buffer, then streams live. No client
seq watermark — the detached-runs seq-restart bug class is designed out (the
buffer IS the terminal state; replaying it from the top is always correct).

### Input

Everything is client-side mapped to raw PTY bytes; the backend just writes
what it is given (`POST /api/terminal/input {data}`):

- **Composer send** → text + `\r` (runs the line).
- **Special-key row** → `Enter \r`, `Esc \x1b`, `↑ \x1b[A`, `↓ \x1b[B`,
  `Tab \t`, `Ctrl+C \x03` — enough to drive Claude's interactive menus from
  a phone.
- **Desktop bonus:** xterm's own `onData` (focused terminal keystrokes) posts
  the same way, so a desktop user can just type in the terminal.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/terminal/start {cols,rows}` | Ensure a live session for the repo (idempotent; restarts a dead one) |
| `GET /api/terminal` | Status `{running, cols, rows}` for reconcile on mount |
| `GET /api/terminal/stream` | SSE: full-buffer replay, then live `{type:"data", data:<base64>}` |
| `POST /api/terminal/input {data}` | Write raw text/escape bytes to the PTY |
| `POST /api/terminal/resize {cols,rows}` | `ResizePseudoConsole` (fit addon drives this) |
| `POST /api/terminal/kill` | Kill the PowerShell + pseudo-console |

Output bytes are base64 inside JSON SSE lines (ANSI bytes are newline-laden;
base64 keeps the SSE framing safe). Auth is the global middleware, as always.

### UI

- Tab icon `>_`, route `/studio/terminal`, after Screen in the nav order
  (BottomNav + PaneStrip kept in sync).
- xterm.js (`@xterm/xterm` + `@xterm/addon-fit`), dark theme, fit-to-width
  with a small font; FitAddon refits on resize and posts the new size.
- Under the terminal: special-key row, then composer (input + Send), plus
  Restart/Kill controls.
- **Advanced-only**: `terminalTab: 'advanced'`. This is a real Administrator
  shell behind the harness password — strictly the most powerful surface in
  the app. Never promote to basic.

### ConPTY interop

No built-in .NET API — `Services/Terminal/ConPty.cs` P/Invokes
`CreatePseudoConsole` / `ResizePseudoConsole` / `ClosePseudoConsole` +
`CreateProcessW` with the `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE` attribute
(the documented ConPTY recipe). Output pipe is read on a dedicated task;
ConPTY speaks UTF-8 VT both directions. Kill order: terminate process, then
close the pseudo-console, then close pipes.

## Implementation

1. `ClaudeWeb.App/Services/Terminal/ConPty.cs` — interop wrapper (pipes,
   pseudo-console, process, resize, dispose).
2. `ClaudeWeb.App/Services/Terminal/TerminalSession.cs` — one PTY session:
   ring buffer + subscriber channels (RunSession pattern), reader task,
   `WriteAsync`/`Resize`/`Kill`.
3. `ClaudeWeb.App/Services/Terminal/TerminalSessionService.cs` — per-repo
   registry; kills all sessions on `ApplicationStopping`.
4. `ClaudeWeb.App/Services/Terminal/TerminalModuleExtensions.cs` +
   one `AddTerminalModule()` line in the marked EmbeddedApi region.
5. `ClaudeWeb.App/Controllers/TerminalController.cs` — endpoints above,
   `[TERM]` log category.
6. `client/src/pages/Terminal.jsx` + `terminal.css` — xterm view, SSE attach,
   composer, key row; `@xterm/xterm` + `@xterm/addon-fit` deps.
7. Route in `App.jsx`, tab in `BottomNav.jsx` + `PaneStrip.jsx`,
   `terminalTab: 'advanced'` capability, i18n keys (en/tr).

## Verification

`.claudeweb-preview/playwright/verify-terminal-tab.mjs` against the isolated
:5201 harness: tab visible in advanced mode only; terminal renders a prompt;
composer-sent `echo` round-trips (output appears in xterm); special keys post;
kill/restart works; screenshot read before claiming success. The test repo is
the pinned self repo; the session is killed in `finally` so no PowerShell
leaks.

## Risks / notes

- A live PowerShell as Administrator: gated behind Advanced UI mode +
  harness auth, same trust level as the Chat tab's `claude` itself (which
  can already run arbitrary commands), but with zero permission prompts.
- The :5201 preview harness gets its own in-process sessions (nothing
  shared with live except the repo files themselves).
- ConPTY scroll-back: xterm keeps its own scrollback (5000 lines); the
  server ring buffer only bounds reattach replay depth.
