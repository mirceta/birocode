# Hide the Self-Development repo from Basic-mode users

## Why

The harness pins its **own source repo** as a repository (`IsSelf = true`,
`RepositoryConfig.cs:20`), created at startup and **moved to index 0 — the default
project** (`RepositoryRegistry.EnsureSelfRepo`, lines 154-183). This is the
**Self-Development** case: opening it means Product = Harness, an Advanced-only
power-user workflow (isolated builds, `swap.ps1`, the dual "Claude Web" chat).

A **Basic-mode (End User)** should never see it. Today they can:

- **It shows in the project list.** `Projects.jsx:127` filters the selector by the
  `visibility` field only — `repos.filter(r => r.visibility === 'basic')` — and
  ignores `isSelf`. If the self repo's `visibility` is (or ever becomes) `'basic'`,
  it appears as a normal project to the End User.
- **Its conversation leaks.** Because the self repo is the **index-0 default**, a
  fresh Basic user (or one whose persisted selection resolves back to it) lands on
  the self repo, so opening another project (e.g. `kekik-topluyoruz`) still renders
  the **ClaudeWeb self conversation**. The dual-chat "harness" view is already marked
  `dualChat: 'advanced'` (`UiModeContext.jsx`), but nothing prevents the self repo
  from being the *active* repo for a Basic user, and its sessions render anyway.

The Self-Development repo and its conversation are an Advanced-only concern. This
change makes that a hard rule on the End User's surface.

## What Changes

- **Exclude the self repo from the Basic project list.** In Basic mode the repo
  selector SHALL drop every `isSelf` repo regardless of its `visibility` value, so
  the harness's own repo is never offered to an End User.
- **Never let a Basic user's active/default repo be the self repo.** When the
  resolved current repo (persisted selection, or the index-0 default) is the self
  repo and the mode is Basic, fall back to the first Basic-visible repo (or the
  empty state if none) — the End User never lands on Self-Development.
- **Never render the self/harness conversation in Basic mode.** With the active repo
  guaranteed non-self and the "harness" dual-chat view already Advanced-gated, the
  ClaudeWeb self conversation and its sessions SHALL not render for a Basic user,
  including immediately after switching projects.
- **Switching Advanced → Basic re-applies the rule live.** If a user is viewing the
  self repo in Advanced mode and toggles to Basic, the selection/conversation SHALL
  re-resolve to a non-self repo (or empty state) rather than keep showing it.

## Impact

- **Affected specs:** `project-visibility` (**new capability, seeded** by this change
  — `plans/project-visibility.md` was never folded into `openspec/specs`; seed-and-grow
  per CLAUDE.md as we touch it).
- **Affected code (frontend):**
  - `client/src/pages/Projects.jsx` (~line 127) — exclude `isSelf` from `visibleRepos`
    in Basic mode.
  - `client/src/context/RepoContext.jsx` (load/self-heal, ~18-67) and/or
    `client/src/context/ChatContext.jsx` (`selfRepoId`, `activeRepoId`, ~74-119) —
    ensure a Basic user's resolved current repo is never the self repo; fall back to
    the first Basic-visible repo.
  - `client/src/context/UiModeContext.jsx` — the `dualChat: 'advanced'` gate stays;
    confirm the harness view cannot mount in Basic.
- **Mode is device-local / client-side** (`UiModeContext.jsx`, localStorage
  `claudeweb_ui_mode`); the backend has no knowledge of UI mode. This change therefore
  enforces visibility **on the client**, consistent with the existing
  project-visibility filtering. **Out of scope:** backend/server-side enforcement of
  per-mode repo access (the backend `/api/sessions` and `/api/repos` still return the
  self repo to any authed client that asks for it by id; a hard server-side gate would
  require teaching the backend the caller's mode and is a separate change).
- **Non-removable invariant preserved:** the self repo stays pinned at index 0 and
  non-removable for Advanced users (`RepoController.Remove` still refuses
  `IsSelf`); this change only hides it from Basic, it does not unpin or delete it.
- **Out of scope:** the existing per-project `visibility` toggle for *non-self* repos
  (unchanged); any change to how Advanced users see or use Self-Development.
