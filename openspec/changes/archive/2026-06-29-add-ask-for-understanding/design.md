# Design — Ask for understanding

## Context

This builds directly on the Discover-local-apps machinery (openspec `discover-local-apps`
+ `discover-local-apps-resilient`). That chain is:

```
PinnedAgent.jsx (button) → GET /local-apps/discover (start-or-join)
  → LocalAppDiscoveryJobs (per-repo background Task, own CancellationToken, latest-only)
    → LocalAppDiscoveryAsk → StructuredAskRunner → ClaudeMonitorClient → :5123 /api/claude
  → RepoEventLog events (op=discovery) → EventConsole lane (poll /repos/{id}/events)
PinnedAgent polls GET /local-apps/discover/status until terminal.
```

We deliberately **mirror this shape** so the new feature is observable in the same Console
lane and inherits the same disconnect-resilience, rather than inventing a parallel model.

## Key decisions

### 1. Snapshot-resume (fork), not continue (resume-in-place)

Claude Monitor exposes two ways to extend a conversation:

- `POST /api/claude/continue` — resumes the **same** session id in place.
- `POST /api/claude/snapshot-resume` — copies a transcript JSONL to a **fresh** session id
  (rewriting the session id throughout) and runs a new turn on the copy.

We use **snapshot-resume**. The dock conversation (`tab.sessionId`) is the user's live chat;
resuming it in place would interleave a long file-writing turn with whatever the user does
next and could collide with an in-flight turn. Snapshot-resume forks a private copy taken at
press time, so:

- the live conversation is untouched (no resumed turn, no lock contention);
- the fork captures the conversation **"at that time"** — exactly the user's wording;
- the run is independent and can run concurrently with the user continuing to chat.

The snapshot source is the on-disk transcript the harness already knows how to locate:
`SessionService.ProjectsDirectoryFor(repoPath)` + `<sessionId>.jsonl`.

### 2. Write-capable run — the new authority (Option A: accept the CLI default toolset)

Discover is read-only because *our harness* pins `--allowed-tools Read/Grep/Glob/LS` on the
`/api/claude` path. This run must **author files** (the Understanding app), so it needs write
access. That is the substantive escalation in this change and the reason it is "more advanced."

Crucially, this is **not** a Claude Monitor limitation: the gateway just spawns the `claude`
CLI. The snapshot-resume/continue path resumes with literally
`claude -p - --resume "<id>" --output-format stream-json --verbose`
(`ClaudeCliRunner.cs:125`) — **no `--allowed-tools`** — and `SnapshotResumeRequest`
(`GatewayModels.cs:66`) has **no `AllowedTools` field** to pass one. So the fork already runs
with the CLI's **default** permission set, which includes `Write`/`Edit`.

**Decision — Option A: accept the CLI default toolset.** No change to Claude Monitor; the fork
can write the Understanding app today. The trade-off we accept is that we **cannot bound** the
toolset (e.g. drop `Bash`) from our side, because snapshot-resume carries no tool list. We
rejected **Option B** (add an `AllowedTools` field to `SnapshotResumeRequest` and emit
`--allowed-tools` in the resume args) to keep this change confined to `birocode` with zero
edits to `birokrat-ai-platform`.

We bound the blast radius without a tool list:

- **Working directory = the repo root** (the dock's repo), so writes are confined to that
  repo, and the output lands where the Local tab's Understanding app already serves it
  (`understanding-app/index.html`).
- **The prompt scopes the task to `understanding-app/`** per
  `docs/understanding-app-convention.md` — a directory the convention explicitly says is
  "rolling latest — overwrite it each time," so overwriting it is the intended behavior, not
  collateral damage.

This trade-off (write access vs. read-only, and unbounded default tools) is called out here
because it is the one genuinely new piece of authority the feature introduces; reviewers
should weigh it.

### 3. The continuation prompt

The forked agent already has the **whole conversation** as context (it is a continuation).
The prompt therefore does not re-paste the conversation; it instructs the agent to:

- read `docs/understanding-app-convention.md` and follow it exactly;
- focus on the **most recent assistant turn** in the conversation (what the user just read);
- (over)write `understanding-app/index.html` plus any vendored assets so it visually explains
  that turn with demos / diagrams / a thorough interactive explanation;
- keep it build-less, self-contained, and **relative-URL only** (the proxy sub-path contract).

#### 3a. Cross-repo convention pointer — resolve birocode by the `playground` ancestor

The convention doc (`docs/understanding-app-convention.md`) lives **only in birocode**, the
canonical Harness repo. But this button can fire from **any** registered repo, whose working
directory is the run's CWD. Telling the fork to read "`docs/understanding-app-convention.md`
in this repository" then points at a file that doesn't exist in a non-birocode repo, and the
agent either guesses the convention or skips it.

We cannot hard-code birocode's absolute path — it sits at a different place on every machine.
The one invariant we rely on: **every repo lives under a folder named `playground`, and
birocode is a direct child of that same `playground`.** So `UnderstandingAsk.ResolveConventionDoc`
walks the firing repo's **ancestors** up to the nearest directory named `playground`, then
descends into `birocode/docs/understanding-app-convention.md`, and injects that **absolute path**
into the prompt. Firing from birocode itself resolves to its own copy, so the path is uniform.
When no `playground` ancestor exists (or the doc isn't there), we fall back to the relative
phrasing. The prompt also now states explicitly: build the app in **this** repo (the working
directory), not where the doc lives — since the doc and the target repo can now differ.

### 4. Backend-owned, latest-only, observable (reuse the Discover model)

- A new per-repo job registry (modeled on `LocalAppDiscoveryJobs`): `StartOrJoin(repoId,
  repoPath, sessionId)` returns the running job or starts a fresh one (latest-only), on a
  background `Task` with **its own** `CancellationToken` so a phone disconnect mid-run does
  not cancel it.
- `POST /api/understanding/ask` (start-or-join) and `GET /api/understanding/status` (reattach,
  never starts) — the same two-endpoint shape as Discover, scoped by `X-Repo-Id`.
- Progress is emitted to the existing `RepoEventLog` with `op="understanding"` and phases
  `started` / `done` / `error`. `EventConsole.jsx` already renders arbitrary `op/phase/title/
  detail`, so **no Console UI change** is needed — it appears in the same lane as Discover.

### 5. Scope to the builder lane's conversation

Only the dock's **builder** lane carries a `sessionId` (`PinnedAgent.jsx:57`; the Ask lane is
`sessionId: null`). The button operates on `tab.sessionId` and is **disabled** when it is
absent (no conversation started yet), with an i18n hint — rather than erroring on click.

## Failure modes

- **No conversation** (`sessionId` null/unknown, or transcript file missing): button disabled
  client-side; backend also rejects with a friendly error event if asked anyway.
- **Gateway down** (`localhost:5123` unreachable): same friendly "Claude Monitor gateway is
  not running…" error pattern Discover already returns, surfaced as an `error` Console event.
- **Agent run fails / times out:** job ends in `error`, Console shows the error detail; the
  live conversation and any prior Understanding app are untouched.

## Alternatives considered

- **Resume in place (`/api/claude/continue`)** — rejected: interleaves with the live chat and
  risks collision with an in-flight turn (see decision 1).
- **Re-paste the conversation into a fresh prompt** — rejected: snapshot-resume already
  carries full context faithfully (including tool calls) and is the purpose-built mechanism;
  re-pasting loses fidelity and bloats the prompt.
- **Reuse `StructuredAskRunner`** — rejected: that path is for read-only typed-JSON reports.
  This run writes files and returns no validated report, so it uses snapshot-resume directly.
