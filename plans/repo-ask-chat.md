# Side "Ask" conversation per repo

**Status:** Shipped — **all three slices** built, browser/API-verified on isolated
:5210 and on live :5099; **deployed to live :5099 & confirmed by the user
2026-06-15** (not yet merged to main) on branch `feature/repo-ask-chat`. Approach
**A** with a **read-only Ask lane** (`--permission-mode plan`) — verified to
read/answer but block all mutation. Surfaces: a third **Ask** segment in the
main chat switcher, and a **Builder | Ask** toggle on every dashboard dock.

> **Amended 2026-06-15 (plans/ask-handoff.md):** the Ask lane no longer uses
> `--permission-mode plan`. It now runs in normal `default` mode with a
> **PreToolUse guard** (`claude --settings`) that allows Write/Edit **only** for
> `handoff.md` at the repo root and denies every other mutation plus the shell.
> "Read-only" now means **read-only except it may create/edit `handoff.md`** —
> see the Safety note below.

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

Every cell is rated ★ / 5, **oriented so more stars = better**: low dev effort,
low risk, low resource cost, and a small blast radius score *high* (5★), not low.
The raw qualitative basis for each is in the per-approach notes below.

| # | Approach | Dev effort | Dev/safety risk | Concurrent w/ builder | Context isolation | Conversation continuity | Resource cost | UX clarity | Blast radius |
|---|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **A** | **Read-only Ask lane** (shared cwd) | ★★★ | ★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★ |
| **B** | **Worktree-isolated Ask agent** | ★★ | ★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★ | ★★★ | ★★ |
| **C** | **Twin repo entry** (same path) | ★★★★★ | ★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★ | ★★★★★ |
| **D** | **Queued / serialized Ask** | ★★★★★ | ★★★★★ | ★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★ | ★★★★★ |
| **E** | **Direct Claude API service** | ★★ | ★★ | ★★★★★ | ★★★★★ | ★★★ | ★★★ | ★★★ | ★ |

Reading the inverted dimensions: A's **Blast radius ★★★** = "moderate" (it touches
the core run gate); C/D's **★★★★★** = "tiny" (no gate change). E's **Dev effort ★★**
= "high effort." Fewer stars always means the worse outcome.

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

### Decision: read-only Ask lane (chosen 2026-06-15)

Approach **A with a read-only Ask lane** is selected. Impact evaluated below.

## Impact of the read-only decision

### Feasibility — confirmed
The installed CLI (**claude v2.1.177**) has the flags we need:
`--permission-mode <default|plan|dontAsk|bypassPermissions>`, `--allowedTools` /
`--disallowedTools` (with patterns like `Bash(git log:*)`), and `--tools`. So the
read-only posture is a spawn-flag change, not a CLI feature request.

### Recommended posture — defence in depth
Primary: **`--permission-mode plan`** — the CLI's built-in "explore, don't act"
mode (reads/searches freely to answer, structurally barred from edits/exec).
Belt-and-suspenders: also **`--disallowedTools Write Edit NotebookEdit`** and
restrict Bash to non-mutating use. ⚠️ **Must verify in the build slice** that in
headless `-p` mode plan mode (a) still answers conversationally (the help notes it
can emit a `prompt_suggestion` message) and (b) genuinely blocks Write/Edit/Bash
mutations. If `-p` + plan is awkward, fall back to `default` mode + the disallow
list. Either way, prove non-mutation with a test before relying on it.

### Code impact — small and localized
- **`RunSessionService`** (`Services/Chat/RunSessionService.cs`): the `_sessions`
  dict + `TryBeginRun` / `Get` / `IsBusy` / `Snapshot` are all keyed by `repoId`.
  Re-key by **`(repoId, lane)`** (e.g. `repoId` for builder, `repoId#ask` for
  ask). Builder keeps its exact current key → **backward compatible**; the ask
  lane is an independent slot with its own seq stream + event buffer.
- **`ChatController`** (`Controllers/ChatController.cs`): thread a `lane` (default
  `builder`) through `POST /api/chat`, `/api/chat/stream`, `/api/chat/stop`,
  `/api/runs`. `/api/runs` `Snapshot()` shape gains the ask entries — keep builder
  under its existing key so frontend reattach doesn't regress.
- **`CliRunnerService.CreateProcessInfo`** (`Services/Chat/CliRunnerService.cs:597`):
  add the read-only flags after `--verbose` when `lane == ask`. One extra param.
- **Frontend**: a new conversation key + an "Ask" surface (per the chosen UI).
  The convos map already supports per-key sessions/watermarks, so no new plumbing.

### Safety — what read-only buys, and the residual risks
> **Amended 2026-06-15 (plans/ask-handoff.md):** the guarantee below is now
> "no mutation **except `handoff.md`** at the repo root." The single-file hole is
> deliberate (an Ask agent can leave a handoff for another agent) and enforced by
> a PreToolUse hook, not plan mode. The hook's `deny` overrides allow-lists and
> even a host's `bypassPermissions` default, so the policy can't be loosened by
> global settings. handoff.md and the builder's other files don't contend
> (different paths), so the shared-cwd safety case is unchanged.
- **Prevents** the Ask agent editing files (other than `handoff.md`), committing,
  or deleting — so it can't corrupt the builder's work or fight it over the
  working tree. This is the whole reason two `claude` processes can share one cwd.
- **Residual risks to handle / accept:**
  - **Bash is the mutation hole.** "Read-only" via tool-allowlist is only real if
    Bash can't mutate; plan mode closes this holistically — another reason to
    prefer it. If we allowlist Bash, even **`git status` can write `.git/index`**
    (it refreshes the index), so it can contend with the builder's `git add`.
    Prefer truly-read commands (`git log/show/diff`) or no Bash at all.
  - **Moving target:** the Ask agent reads a tree the builder may be mid-editing,
    so answers reflect a snapshot-in-time. Acceptable; worth a one-line UX note.
  - **Shared quota:** both processes use the same Max-plan auth, so concurrent
    heavy runs count against one quota and could hit rate limits. Minor.
- **No regression to the builder:** default lane = builder keeps today's exact
  single-flight behaviour; the ask lane is purely additive.

### UX impact
A fixed, always-available place to ask that never 409s against the builder —
directly resolves the "where do I ask?" confusion. The Ask agent will refuse
edit requests by design; set that expectation in the surface ("Ask is read-only —
switch to the builder to make changes").

## Slices

1. **Backend ask lane** — ✅ **DONE (2026-06-15).** Run gate re-keyed by
   `(repo, lane)` in `RunSessionService` (builder keeps the bare repoId; ask is
   `repoId#ask`); `lane` threaded through `/api/chat`, `/chat/stream`,
   `/chat/stop`, `/api/runs`; ask lane spawns `claude --permission-mode plan`.
   API-verified on isolated :5210 (`verify-ask-lane.mjs`): builder + ask run
   concurrently on one repo (no 409), both lanes show in `/api/runs`, a 2nd
   builder still 409s, and an ask turn told to write a file **did not** create it.
   Empirically confirmed `--permission-mode plan` in headless `-p` reads/answers
   but blocks all mutation (Write/Edit/Bash gated behind un-approvable ExitPlanMode).
2. **Frontend Ask surface** — ✅ **DONE (2026-06-15).** A third **Ask** segment
   in the dual-chat switcher (Advanced mode), next to Project / Claude Web. It
   follows the active project, has its own `'ask'` conversation key + session,
   resets on project switch, and threads `lane: 'ask'` through send / stream /
   stop / reconcile (run keyed `repoId#ask`) so it never blocks or collides with
   the builder. A one-line read-only note sits under the switcher. Files:
   `ChatContext.jsx`, `DockContext.jsx`, `Chat.jsx`, `chat.css`, `en.json`.
   Browser-verified on isolated :5210 (`verify-ask-surface.mjs`): Ask segment
   shows, selecting it switches view + shows the note, Ask send carries
   `lane:"ask"` while Project send omits it. Not yet deployed.
3. **Ask on the dashboard docks** — ✅ **DONE (2026-06-15).** Each "phone" in the
   agent-dashboard wall gets a **Builder | Ask** toggle (`PinnedAgent`), so you can
   flip any dock to a read-only Ask conversation on that agent's repo — one Ask per
   repo, many visible at once. `useChatFor` gained a `lane`; the ask lane uses key
   `ask:<repoId>` and passes `tabId: null` so it never patches the builder dock's
   badge/session. Browser-verified on isolated :5210 (`verify-ask-dock.mjs`): every
   phone shows the toggle, Ask send carries `lane:"ask"`, Builder omits it.
   **Deployed to live :5099 (frontend-only refresh, no backend restart) &
   confirmed by the user 2026-06-15.** (Answers "multiple Ask conversations": yes,
   one per repo via the docks; multiple Asks on the *same* repo is intentionally
   out of scope.)
4. (later) further polish — unread/working indicators, header entry point,
   Simple-mode exposure decision.

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
