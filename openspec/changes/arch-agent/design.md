# Arch Agent — design

## Context

Every chat path in the harness today is repo-scoped: `ChatController` resolves the
working directory from `RepositoryResolver.Current()` (the `X-Repo-Id` header),
`RunSessionService` keys run slots by `(repoId, lane)`, and CLI transcripts are keyed
by working directory (`SessionService.EncodeCwd`). The proposal adds a top-level chat
whose working scope is the **Projects Root** — the parent of the pinned self repo,
already computed in `RepoController.ProjectsRoot()` — which is not a registered repo.

Two existing mechanisms shape the design:

- **The fixed-chat precedent.** `ChatContext.jsx` already runs standing, non-dock
  conversations under fixed keys (`'default'`, `'harness'`, `'ask'`), and
  `DockContext`'s `chatView` selector switches between them. The harness view is
  exactly the shape the arch agent needs — a permanent chat pinned to a specific
  working scope.
- **The silent-fallback trap.** `RepositoryResolver.Current()` falls back to
  `Default()` (the self repo) for any unknown id. An arch chat naively sent with a
  made-up repo id would today run Claude **inside the harness repo** — the exact
  context bleed the proposal wants to end. The resolver must handle the arch scope
  explicitly.

Constraints: reuse the detached RunSession machinery (no second chat stack); the
arch agent's write powers stay narrower in intent than a dev chat's; new UI defaults
to Advanced per the UI-modes convention.

## Goals / Non-Goals

**Goals:**

- A standing Arch Agent chat whose CLI runs execute at the Projects Root, with its
  own persisted session continuity, reusing `RunSessionService`/`CliRunnerService`
  and the SSE attach/reattach protocol unchanged.
- A role prompt that scopes the agent to playground operations and steers
  harness-feature requests back to the harness dev chat.
- A distinct, always-available UI entry point (chat view + optional dashboard tile),
  gated Advanced.
- No unknown-id traffic ever lands in the self repo by accident on the arch path.

**Non-Goals:**

- No new orchestration stack (no arch-owned task queue, scheduler, or agent
  framework) — the agent calls existing harness primitives (repos API, loops, task
  graph) as its tools.
- No process-level sandboxing of the arch agent in v1 — the write-scope boundary is
  instructions-level (role prompt), same trust model as every other chat.
- No changes to the Projects tab, loop engine, or task graph.
- No multi-conversation management for the arch chat in v1 — one standing
  conversation with session-resume, like the harness view.

## Decisions

### D1 — The arch scope is a virtual repo context with the well-known id `arch`

`RepositoryResolver` (or the registry behind it) recognizes the reserved id `arch`
and returns a synthetic, non-persisted `RepositoryInfo`: `Id = "arch"`,
`Name = "Arch"`, `Path = <Projects Root>`, `Exists = true`, `IsGitRepo = false`,
advanced visibility. It is **not** written to `repositories.json` and **not**
returned by `GET /api/repos`, so the Projects tab and repo pickers stay clean.

- *Why over (a) registering a real hidden repo entry:* a persisted entry leaks into
  every list unless every consumer learns a new flag; the registry file is shared
  with live/preview instances (test-hygiene pain we've already been bitten by); and
  the Projects Root can move if the self repo moves — a virtual entry re-derives it
  per request, a persisted one goes stale.
- *Why over (b) a parallel non-repo chat pipeline:* everything downstream —
  `RunSessionService` keying, SSE endpoints, `SessionService` transcripts keyed by
  cwd, dock stash — works verbatim once `Current()` returns a path. A second
  pipeline is the scope creep the proposal warns against.
- Collision risk is nil (real ids are GUIDs). The resolver handles `arch` **before**
  the unknown-id fallback, killing the silent self-repo fallback for this path.
  `ProjectsRoot()` derivation moves from `RepoController` onto the registry so both
  callers share it; if no self repo exists (no Projects Root derivable), `arch`
  resolves to nothing and chat returns 400 rather than falling back.

### D2 — Role instructions via `--append-system-prompt`, from a committed file

`CliRunnerService.CreateProcessInfo` gains an optional system-prompt-append
parameter, passed only for arch-scoped runs. Its content is a committed markdown
file in the harness repo (`docs/arch-agent-role.md`) read at run time: the arch
agent's responsibilities (operate the playground: list/inspect/create/organize
projects, cross-project research, set up loops/scheduled work via harness APIs),
its non-responsibility (harness feature development → redirect to the harness dev
chat), and its write-scope intent (prefer harness APIs over raw destructive fs
operations across projects).

- *Why over a `CLAUDE.md` at the Projects Root:* the playground folder is shared,
  unversioned territory the harness does not own — writing instructions there
  side-effects every agent and every repo-external tool on the box, and there is no
  deploy story for keeping it current. A committed file ships, diffs, and reviews
  with the harness. (A user-authored playground `CLAUDE.md`, if one ever exists,
  still applies — append composes with it.)
- Permission mode is unchanged from other chats (v1). The narrower write scope is
  expressed in the role prompt, not enforced by the process — recorded as a risk
  below.

### D3 — UI surface: an `arch` chat view beside `harness`, plus an optional dashboard tile

Frontend reuses the fixed-chat machinery:

- `ChatContext`: new fixed key `'arch'` targeting `repoId: 'arch'`, added to the
  fixed-key allowlist (lines that protect `'default' | 'harness' | 'ask'` from dock
  cleanup) so the conversation survives dock churn. Session-resume behaves like the
  harness view.
- `DockContext`: `chatView` gains `'arch'` alongside `'agent' | 'project' |
  'harness' | 'ask'`; the chat view switcher shows an **Arch** entry, visually
  distinct (own icon/accent) so it never reads as another repo tab.
- **Dashboard tile (the agent-dock delta):** the dock toolbar offers a standing Arch
  entry; toggling it on creates/uses a dock tab with `repoId: 'arch'`.
  `DockRegistry.Add` already accepts any non-blank repo id, and `PinnedAgent`
  already degrades gracefully for an unregistered id (no path, no git, no local
  apps) — the arch tile leans on that: chat-only tile, repo-bound chrome hidden
  deliberately rather than accidentally.
- Capability map: `archAgent: 'advanced'` in `UiModeContext.FEATURES`; i18n keys in
  both `en.json` and `tr.json`.

*Why a chat view and not only a dock tile:* the dock is a roster of repo agents the
operator curates; the arch agent is a standing surface that must be reachable even
with an empty dock. The harness view already models this exactly.

### D4 — Sessions and transcripts need no new storage

CLI transcripts land under `~/.claude/projects/<encoded Projects Root>` automatically
(cwd-keyed), so `GET /api/sessions` against `X-Repo-Id: arch` lists arch history with
zero new code. Run slots key as `("arch", lane)` in `RunSessionService`; seq
monotonicity and reattach semantics are untouched.

## Risks / Trade-offs

- **[Instructions-only write boundary]** The arch agent runs with the same CLI
  permissions as any chat; a prompt can still ask it to edit any project. →
  Mitigation: role prompt states the boundary explicitly; blast-radius reduction to
  OS/process level is future work, out of scope here (noted in proposal).
- **[Repo-scoped endpoints hit with `arch`]** Git/status/local-app endpoints called
  with `X-Repo-Id: arch` will operate on the playground folder (not a git repo). →
  Mitigation: they already degrade (empty/404) for path-without-git; the arch
  surfaces simply don't render those blocks. Verify in the browser per convention.
- **[Fallback regression]** Touching `RepositoryResolver.Current()` risks changing
  behavior for genuinely unknown ids. → Mitigation: `arch` is an exact-match branch
  before the existing fallback; existing fallback behavior stays byte-identical for
  every other id.
- **[Context bleed via CLAUDE.md discovery]** Claude CLI running at the Projects
  Root may still read per-project `CLAUDE.md`s when it descends into a project. →
  Accepted: that is correct behavior when operating on that project; the role
  prompt's dev/ops split covers the harness repo case.
- **[Dock tile confusion]** An arch tile in the dashboard grid could read as "a repo
  named Arch". → Mitigation: distinct visual identity (D3) and no repo chrome.

## Migration Plan

Additive feature — no data migration. `dock.json` may gain a tab with
`repoId: "arch"`; older builds render it as a degraded (chat-dead) tile but nothing
breaks. Rollback = normal deploy rollback; the committed role file and virtual id
carry no persisted state.

## Open Questions

- Should the Arch entry also appear in Basic mode eventually (it is End-User-shaped:
  "make me a new project")? Deferred — ships Advanced per convention; promotion is a
  one-line capability-map change.
- Exact voice/content of `docs/arch-agent-role.md` — drafted during implementation,
  reviewed with the user.
