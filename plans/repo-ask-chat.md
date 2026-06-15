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
something must allow a **second conversation to run against the repo at the same
time**. Two hard constraints shape every option:

- **The lock** — `TryBeginRun(repoId)` allows one running turn per repo (409 on
  a second). Either loosen it, or sidestep it.
- **Shared filesystem safety** — two `claude` processes in the **same cwd** is
  only safe if the second **cannot mutate** the tree (no Write/Edit, no mutating
  Bash); otherwise they race on files and git. So any concurrent option must
  either make the Ask agent **read-only** or give it **its own filesystem**.

## Approaches considered

| # | Approach | Dev effort | Dev/safety risk | Concurrent w/ builder? | Context isolation | Conversation continuity | Resource cost | UX clarity | Blast radius |
|---|----------|-----------|-----------------|------------------------|-------------------|-------------------------|---------------|------------|--------------|
| **A** | **Read-only Ask lane, shared cwd** — gate per `(repo, lane)`; spawn Ask `claude` read-only in the same dir | **Med** — backend gate change + read-only spawn flag + a chat surface | **Low–Med** — safe *iff* read-only flag truly holds; rests on CLI support | ✅ Yes | ✅ Own session | ✅ Persistent | **Low** — just another process | **High** — one obvious "Ask" surface | Med — touches the core run gate |
| **B** | **Worktree-isolated Ask agent** — Ask runs full-capability in its own git worktree of the repo | High — worktree lifecycle (create/cleanup), path plumbing, gate change | Med — no file race, but worktree mgmt bugs; Ask can edit (its copy) | ✅ Yes | ✅ Own session | ✅ Persistent | **High** — disk per worktree, setup latency | Med — "why is my Ask on a copy?" / uncommitted builder edits invisible | Med–High — new subsystem |
| **C** | **Twin repo entry (same path)** — register the path again as an "Ask" project; existing per-repo gate already allows both | **Low** — mostly registration/UX; **no run-gate change** | Med — still shares cwd, so Ask must be read-only anyway; two repoIds for one path is leaky | ✅ Yes | ✅ Own session (separate repoId) | ✅ Persistent | Low | **Low** — two entries for one folder is confusing | **Low** — reuses existing machinery |
| **D** | **Queued / serialized Ask** — keep one run per repo; Ask waits behind the builder | **Low** — small queue + UI state | **Low** | ❌ **No** — fails the core need | ✅ Own session | ✅ Persistent | Low | Med — "why won't it answer now?" | **Low** |
| **E** | **Direct Claude API ask service** — in-process Anthropic SDK Q&A with read-only repo tools, bypass the CLI | **High** — new tool loop, context gathering, streaming, model plumbing | Med–High — reimplements what the CLI gives free; diverges from architecture | ✅ Yes (independent of the lock) | ✅ Separate by construction | ⚠️ Build our own history store | Med | Med — different "feel" from CLI agents | High — large new surface |

Legend: ✅ meets it · ⚠️ partial / needs extra work · ❌ doesn't meet it. Effort/risk
are relative (Low < Med < High).

**Overall rating (★ / 5)** — a single judgement weighing "meets the need" highest,
then risk and cost:

| Approach | Rating | One-line why |
|----------|--------|--------------|
| **A — Read-only Ask lane, shared cwd** | ★★★★½ (4.5) | Meets everything at modest cost; only caveat is verifying the read-only CLI flag |
| **C — Twin repo entry (same path)** | ★★★½ (3.5) | Cheapest, no run-gate change; loses points on "one folder, two projects" confusion |
| **B — Worktree-isolated Ask agent** | ★★★ (3) | The right call *only if* Ask must edit; worktree lifecycle + snapshot staleness are real overhead |
| **E — Direct Claude API ask service** | ★★ (2) | Most control over read-only, but throws away CLI sessions/resume/streaming; over-engineered |
| **D — Queued / serialized Ask** | ★½ (1.5) | Cheap and safe, but fails the core "ask **while** building" requirement |

Per-approach notes:

- **A (recommended):** smallest change that fully meets the need. Each lane keeps
  its own `RunSession` + sessionId + seq stream. **Hinges on the read-only CLI
  flag** — likely `--permission-mode plan` and/or `--disallowedTools Write Edit …`
  / `--allowedTools Read Grep Glob Bash(git log:*) …` in
  `CliRunnerService.CreateProcessInfo()` (`CliRunnerService.cs:597-636`), which
  today passes **no** permission flags. **Verify against the installed CLI first** —
  the whole safety case depends on it. If the flag doesn't hold, A degrades toward B.
- **B:** the safe way to give the Ask agent *full* capability. The Agent/worktree
  isolation pattern exists in tooling, but managing worktrees for long-lived Ask
  agents (cleanup, the Ask seeing a snapshot without the builder's uncommitted
  work) is real overhead for a "just let me ask" feature.
- **C:** clever — needs **no change to the run gate** because two repoIds = two
  slots. But it doesn't remove the shared-cwd race (Ask must still be read-only),
  and surfacing one folder as two projects is confusing. Good fallback if we want
  to avoid touching `RunSessionService`.
- **D:** the honest baseline. Cheap and safe, but the user explicitly wants to ask
  **while** the builder runs, so this fails the primary requirement. Listed for
  comparison / as a stopgap.
- **E:** maximum control over the read-only posture and isolation, but it throws
  away the CLI machinery (sessions, resume, streaming, reattach) we already rely
  on and would feel different from every other agent. Over-engineered for this.

## Recommended approach

**A — read-only Ask lane, shared cwd**, with **C as the fallback** if we'd rather
not modify the core run gate. Plan:

- **Backend:** add a `lane` (or `mode`) to `RunSession`/`TryBeginRun` so the gate
  is per-`(repo, lane)`; plumb a read-only flag through `ChatRequest` →
  `CliRunnerService` → `CreateProcessInfo()`. Ask runs get their own sessionId,
  buffered seq stream, stop, and reattach — mirroring builder runs.
- **Frontend:** add an **Ask** chat surface (third `chatView` alongside
  `agent`/`project`/`harness`, or a dedicated dock) that follows the active
  project, has its own conversation key + sessionId, and is reachable even when
  the builder shows "running." Make it the obvious answer to "where do I ask?"
- **Docs:** extend `plans/dual-chat.md`'s one-run-per-repo note; update the
  Glossary if "Ask"/"builder lane" becomes canonical.

### Open decision (need the user)

Confirm the **Ask lane is read-only** (recommended — safe alongside the builder,
matches "I just want to ask") vs **full capability** (forces approach B's
worktree isolation). This picks A vs B above.

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
