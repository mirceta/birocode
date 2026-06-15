# Side "Ask" conversation per repo

**Status:** Planning (branch `feature/repo-ask-chat`). Not built. One crux
decision open (read-only vs full-capability Ask lane) — see below.

## Problem

A repo's agent is a **builder**: by design the only agent in that repo while it
works. This is a hard backend constraint, not a UI convention —
`RunSessionService.TryBeginRun(repoId)` (`ClaudeWeb.App/Services/Run/RunSessionService.cs:166-178`)
atomically allows **one running turn per repoId**; a second `POST /api/chat`
gets a **409** (`ChatController.cs:73-81`). Consequences the user hit:

- **Can't ask while the builder runs** — the repo's run slot is taken (409).
- **Asking in the builder's chat pollutes its context** even when idle.
- So there's **no obvious place** to ask a quick question about a repo.

## Goal

A persistent, always-available **Ask** conversation per repo that (1) is a fixed
known place to ask, (2) works **concurrently** with a running builder, and (3)
keeps its **own context** so it never pollutes the builder's session.

## What already helps

- **Sessions are per-conversation JSONL files** scoped by working directory
  (`SessionService.cs:53-57`): `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.
  An Ask conversation simply uses its **own sessionId** → separate context, zero
  pollution. No new storage needed.
- **The frontend already runs multiple conversations per repo** — the dual-chat
  map keyed by `activeKey` (`ChatContext.jsx:54-56`) with Project (`'default'`)
  and Claude Web (`'harness'`) surfaces. An Ask surface is a third key.
- **Detached, reattachable runs** (`/api/chat/stream?after=N`, `/api/runs`)
  already exist; an Ask run reattaches the same way.

## The crux — concurrency on one working directory

The blocker is the **per-repo single-run lock**. To ask while the builder runs,
the backend must allow a **second concurrent run on the same repo**. Options:

1. **Key the run gate by `(repoId, lane)`** where `lane ∈ {builder, ask}`.
   `TryBeginRun` then permits one builder run **and** one ask run at once. This
   is the smallest change that unblocks the need. Each lane keeps its own
   `RunSession` + sessionId + seq stream.

Running **two `claude` processes in the same cwd** is only safe if the Ask one
**does not mutate the tree** (no Write/Edit, no mutating Bash) — otherwise the
two agents race on files and git state. Hence:

### Open decision (need the user)

- **Ask lane = read-only (recommended):** spawn the Ask `claude` with a
  read-only posture so it can read/search/explain but not edit. Matches "I just
  want to *ask* something," and makes concurrent-with-builder safe. **Needs
  verifying the CLI flag** — likely `--permission-mode plan` and/or
  `--disallowedTools Write Edit ...` / `--allowedTools Read Grep Glob Bash(git log:*) ...`
  passed in `CliRunnerService.CreateProcessInfo()` (`CliRunnerService.cs:597-636`),
  which currently passes **no** permission flags. Verify against the installed
  CLI before relying on it.
- **Ask lane = full capability:** more flexible but two writers in one dir is
  unsafe; would need worktree isolation or a builder-must-be-idle guard, which
  defeats "ask while building." Not recommended.

## Proposed approach (pending the decision above)

- **Backend:** add a `lane` (or `mode`) to `RunSession`/`TryBeginRun` so the gate
  is per-(repo, lane); plumb a read-only flag through `ChatRequest` →
  `CliRunnerService` → `CreateProcessInfo()`. Ask runs get their own sessionId,
  buffered seq stream, stop, and reattach — mirroring builder runs.
- **Frontend:** add an **Ask** chat surface (third `chatView` alongside
  `agent`/`project`/`harness`, or a dedicated dock) that follows the active
  project, has its own conversation key + sessionId, and is reachable even when
  the builder shows "running." Make it the obvious answer to "where do I ask?"
- **Docs:** extend `plans/dual-chat.md`'s one-run-per-repo note; update the
  Glossary if "Ask"/"builder lane" becomes canonical.

## Slices (draft)

1. **Backend ask lane** — per-(repo, lane) run gate + read-only spawn; prove two
   concurrent runs (builder + ask) on one repo via API, ask lane can't write.
2. **Frontend Ask surface** — the always-available Ask chat, own session,
   not blocked by a running builder; browser-verified.
3. (later) polish — unread/working indicators, entry points (dashboard dock,
   header), Simple-mode exposure decision.

## Verify

Per our flow: browser-verify on an isolated harness instance — start a builder
run, then hold an Ask conversation on the **same repo** simultaneously (no 409),
confirm the Ask agent answers and **cannot edit files**, and that the two
contexts stay separate. Then preview-verify on live before "deploy."

## Risks / open questions

- **CLI read-only support** — must confirm the exact flag(s); the whole safety
  argument rests on the Ask lane being non-mutating.
- **Two processes, one git repo** — even read-only, watch for the builder's
  mid-edit tree confusing the Ask agent's answers (acceptable; it's a snapshot).
- **Surface placement / Simple vs Advanced** — where Ask lives and whether Basic
  mode users see it (default Advanced per repo convention).
