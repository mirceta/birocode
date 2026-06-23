# Per-project Claude permissions, set in the desktop app

> **Status: decisions confirmed (A,B,C,D,E,F); awaiting your final go-ahead to implement.**
> Design, tasks, and spec deltas come *after* the go-ahead — nothing is implemented yet.

## Goal (my understanding of your request)

You want the **Operator** to define, **per project (repo)**, the permission scope that applies
to that project's chat — i.e. the `claude -p` calls the harness spawns for it. The policy is set
from the **WinForms desktop application** (the same operator-only surface that already manages
the IP "guest list" and the project list), **not** from the phone/web UI. When an End User chats
in a given repo, the harness injects that repo's configured policy into the `claude -p`
invocation, so the agent is constrained to exactly the tools/actions the Operator approved for
that project — different projects can have different scopes.

In short: **a per-repo permission policy, edited on the desktop, enforced on every chat
`claude -p` call for that repo.**

## How it works today (grounding)

- **Chat = `claude -p`.** `CliRunnerService.CreateProcessInfo` (`Services/Chat/CliRunnerService.cs:634`)
  is the single chokepoint that builds the argv (`-p … --output-format stream-json …`). Its only
  current permission control is a conditional `--permission-mode plan` for the read-only "ask" lane.
- **Desktop-configured, operator-only state already exists.** `IpAllowlistService`
  (`Services/IpFilter/IpAllowlistService.cs`) is the template: a singleton built in `Program.cs`,
  shared by the WinForms GUI and Kestrel, persisted atomically to `%APPDATA%\ClaudeWeb\ipallow.json`,
  **mutable only from the desktop GUI** (`UI/IpFilterForm.cs`, opened from `UI/MainForm.cs`).
- **Per-repo config already persists.** `Models/RepositoryConfig.cs` (→ `%APPDATA%\ClaudeWeb\repositories.json`,
  via `RepositoryRegistry`) holds each repo's `Id`, `Name`, `Path`, `Visibility`, etc. There is **no
  permission field yet**. The project list is edited in `UI/RepositoriesForm.cs` (opened from MainForm).
- **The one gap:** `ChatController` knows the repo (`repo.Id`, `repo.Path`) but only passes
  `workingDirectory` into the runner — **`repoId`/policy does not reach `CreateProcessInfo` today.**

## What Changes (the concrete steps I plan to take)

1. **Data model** — add a permission-policy field to `RepositoryConfig` (persisted in the existing
   `repositories.json`; no new store, reusing the proven atomic-save path).
2. **Registry** — surface the policy on the `RepositoryInfo` DTO and add a **desktop-only** setter on
   `RepositoryRegistry` (mirroring the IP allowlist's "GUI mutates, web reads" invariant); persist via
   the existing `Save()`.
3. **Desktop GUI** — add a **"Permissions…"** editor per project in `UI/RepositoriesForm.cs`
   (a modal, same pattern as `IpFilterForm`), so the Operator picks each project's scope.
4. **Thread repo identity into the runner** — pass `repoId` (or resolve by `workingDirectory`) from
   `ChatController` → `CliRunnerService.RunAsync` → `CreateProcessInfo`.
5. **Enforce on the call** — in `CreateProcessInfo`, look up the repo's policy and inject the matching
   Claude CLI flags (mechanism per Decision A below), alongside the existing `--permission-mode`/args.
6. **Safe default** — define behavior for a repo with no policy set (Decision C).
7. **Web reflection (read-only)** — expose the preset on `GET /api/repos` and show a **display-only
   badge** on each agent dock in the web Dashboard, so the End User can *see* each project's scope.
   Configuration stays desktop-only (Decision D) — the badge offers no control to change it. *(Added
   per a later request: "the frontend needs a badge/label on the agent docks about what permissions
   are set for that repository.")*

## Confirmed decisions

- **A. Enforcement mechanism ✓** — named **presets** ("Read-only", "Edit-only", "Standard", "Full
  access"), injected into the chat `claude -p` argv as permission flags (`--permission-mode` and/or a
  pinned `--settings` deny policy / `--disallowedTools`; **deny wins**). Edit-only = repo-scoped
  editing with no script/exe execution and no network (added per a later request). A custom allow/deny tool list (`--allowedTools`/`--disallowedTools`)
  is a later advanced add-on. Exact per-preset tool rules are defined in `design.md`.
- **B. UI granularity ✓** — start with a per-project **preset dropdown** in the desktop
  `RepositoriesForm`; the custom rule editor is deferred.
- **C. Default for unconfigured repos ✓ → SAFE** — a repo with no policy set defaults to the
  **Read-only** preset (the safe baseline), *not* today's unrestricted behavior. The Operator opts a
  project up to Standard/Full per project. **Implication:** a newly-registered project's chat is
  read-only until the Operator grants more — the intended "safe by default, opt into power" posture.
  *(If you'd prefer the default be "Standard" — safe-but-can-build — rather than strict read-only, say so.)*
- **D. Operator-only mutation ✓** — the policy is editable **only from the desktop GUI**; the web End
  User can never widen their own scope (matches the IP-allowlist invariant).
- **E. Scope boundary ✓ (+ your gateway assumption VERIFIED)** — v1 governs **only the direct chat
  `claude -p` path**. Verified: the structured-ask gateway is reached only via `StructuredAskRunner` →
  `LocalAppDiscoveryAsk` → `LocalAppsController.Discover` (`GET /api/local-apps/discover`), which takes
  no request body / no free-text and uses a compile-time-constant prompt (only `{{OUTPUT_FORMAT}}`
  substituted); only the operator-registered `repo.Path` is passed. **No End-User text reaches the
  gateway → no prompt-injection vector from the web UI.** Caveat: this is a property of *current usage*,
  not an enforced invariant (a future user-text gateway caller would break it — worth a guard/test if
  you want it guaranteed). The gateway path stays out of scope for v1.
- **F. Interaction with the read-only "ask" lane ✓** — the ask lane stays read-only
  (`--permission-mode plan`) regardless; the per-repo policy further restricts the build lane
  (most-restrictive wins).

## Assumptions

- "Permissions for `claude -p` (the chat)" means the **tool/action permission scope** of the agent
  (which tools it may run, e.g. Bash/Edit/Write/WebFetch and sub-scopes) — not auth/billing, model
  choice, or network ACLs (those are separate, e.g. the IP allowlist).
- One policy per repo (not per-session/per-user); it applies to every chat turn in that repo.
- Reusing `repositories.json` + the `RepositoryRegistry` singleton is acceptable (no new data store).

## Impact (preliminary — finalized after confirmation)

- **Likely a new capability spec** (e.g. `project-permissions`), seeded by this change.
- **Affected code:** `Models/RepositoryConfig.cs`, `Services/Repositories/RepositoryRegistry.cs`,
  `Services/Chat/CliRunnerService.cs` (+ `RunAsync`/`CreateProcessInfo` signature),
  `Controllers/ChatController.cs` (thread repoId), `UI/RepositoriesForm.cs` (+ a new permissions dialog),
  `Controllers/RepoController.cs` (expose `permissionPolicy`), and the web client
  (`PermissionBadge.jsx`, `Dashboard.jsx`, `PinnedAgent.jsx`, `UiModeContext.jsx`, `dashboard.css`).
- **No backend store/wiring changes** beyond a field — reuses the existing singleton + atomic save.
- **Out of scope (v1):** the structured-ask/gateway path; per-session/per-user policies; **the web UI
  *editing* policy** (the web may now *display* it read-only, but never change it).
