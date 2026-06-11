# Terminal sessions — Chat/Term in one nav slot, multiple PTYs, resuming Claude conversations

> **Status (2026-06-11):** In development on `feature/terminal-sessions`
> (stacked on `feature/terminal-tab`, PR #7). Browser-verified on the :5201
> harness (`.claudeweb-preview/playwright/verify-terminal-sessions.mjs`,
> 20/20 checks). Resume behavior: decision (a) — auto-run `claude --resume`.
> Awaiting End User confirmation.

## What and why

Three pieces, decided across the conversation:

1. **Chat and Term stay separate pages** (NOT merged — they are
   billing-distinct since Anthropic's June 15 split: Term = interactive CLI
   on subscription limits, Chat = `claude -p` on the Agent SDK credit pool),
   **but share ONE nav slot in first position** with a toggle — two nav
   entries for "talk to Claude" is clutter.
2. Multiple terminal sessions inside the Term view.
3. Browse and resume previous Claude conversations from the Term view, like
   the Chat tab's session picker.

## Navigation: one slot, two views

- The bottom nav's first slot is the single "Claude" entry. Routes stay
  `/studio` (Chat) and `/studio/terminal` (Term); the slot is active for
  both and opens whichever view was used last (device-local, localStorage;
  default Chat).
- The toggle lives in the page header as a small segmented control
  [ Chat | Term ], rendered on both views — not in the nav, and not a
  tap-again-to-toggle trick on the nav icon (too easy to hit accidentally).
- The standalone `>_ Term` nav entry is removed.
- Basic mode (`terminalTab` is advanced-only): no toggle, the slot is plain
  Chat — unchanged for the End User.
- Multi-pane: the slot contributes ONE pane showing its active view;
  PaneStrip keeps mirroring the nav order.

The key distinction that shapes everything: a **live PTY** (a PowerShell
process) cannot be resumed once dead — but a **Claude conversation** persists
as JSONL transcripts on disk, the same store the Chat tab already lists via
`GET /api/sessions`. So "resume" = pick a past conversation, start a fresh
PTY, run `claude --resume <sessionId>` in it interactively.

Bonus that falls out for free: conversations started in Chat can be resumed
interactively in Term (shared session store) — and from June 15 that choice
is also a billing choice (Term = subscription, Chat = credits).

## Design

### Backend ([plans/terminal-tab.md](plans/terminal-tab.md) is the base)

- Re-key `TerminalSessionService` from `repoId` to `repoId + termId`
  (same shape as dock tabs). A repo can hold several live PTYs.
- All endpoints gain a `termId`: `stream`, `input`, `resize`, `kill`.
- `GET /api/terminal/list` — live PTYs for the repo (`termId`, label,
  running, resumed-from session id if any).
- `POST /api/terminal/start {termId?, resumeSessionId?}` — fresh PowerShell;
  when `resumeSessionId` is set, inject `claude --resume <id>\r` after the
  shell is up. PowerShell stays underneath, so quitting claude drops to a
  prompt instead of killing the session.
- The conversation BROWSER needs no new backend: reuse `GET /api/sessions`.

### Frontend

- The Term tab grows a session strip above the xterm: one chip per live PTY
  ("Terminal 1", "Terminal 2", "↻ <conversation summary>" for resumed ones),
  a "+" button, and the existing Kill scoped to the active session.
- "+" opens a picker: **New shell**, or **Resume a conversation** — the
  same `/api/sessions` list the Chat tab's SessionPicker uses (reuse the
  component if it extracts cleanly, otherwise a sibling).
- ONE xterm instance. Switching sessions = abort the SSE attachment, reset
  the terminal, attach to the chosen `termId` (full-buffer replay — the
  reattach mechanism that already exists, reused verbatim).
- Active `termId` per repo kept in component state; restored via
  `/api/terminal/list` on mount.

### Judgment calls (made, not asked)

- One xterm re-replaying on switch, NOT N hidden terminals — lighter on
  phones, and the replay path is already battle-tested.
- Resumed sessions run claude INSIDE PowerShell (not claude as the PTY
  process) — exiting claude leaves a usable shell.
- Live PTYs die with the harness (deploys/restarts); conversations stay
  resumable forever. Honest model, stated in the UI ("shells don't survive
  restarts; conversations do").
- Advanced-only, same as `terminalTab`. No new capability needed unless the
  session strip should hide separately.
- Session cap per repo (e.g. 5) to bound forgotten-shell sprawl; oldest-idle
  is rejected, not silently killed.

## Decisions made during the build

- Resume = **(a) auto-run** `claude --resume <id>` (user's call). The id is
  validated `^[A-Za-z0-9_-]{1,128}$` server-side — it lands on a PowerShell
  command line and must not smuggle shell syntax.
- `TerminalSession.CreatedAt` orders `List()`: Dictionary enumeration reuses
  freed slots after a Remove, so insertion order alone lied after a kill.
- Fixed in passing: `.app-header__title` now ellipsizes — long
  machine·project·branch titles used to wrap past the 56px sticky header and
  invisibly intercept taps on the first ~26px of page content (it ate the
  Chat/Term toggle on phones).

## Verification sketch

`verify-terminal-sessions.mjs` on the isolated :5201 harness: nav has ONE
first-slot entry and NO standalone Term entry; the [Chat|Term] toggle flips
views and the slot remembers the last view across reloads; Basic mode shows
no toggle; two live sessions hold independent state (different cwd via
`cd`), switch replays the right buffer, kill only kills the active one,
resume picker lists sessions and a resumed PTY shows the old conversation's
context, screenshot read before claiming success. Cleanup kills every test
PTY in `finally`.
