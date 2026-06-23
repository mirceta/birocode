# Design — per-project Claude permissions

## Preset → CLI flag mapping (the heart of it)

Three presets, mapped to `claude -p` flags in **one** place (`CliRunnerService`), chosen for
**predictability in headless `-p` mode** over cleverness. Deny rules are always enforced
(deny wins), so the policy can only *narrow* what the repo's own settings allow.

| Preset | Flags injected | Rationale / confidence |
|--------|----------------|------------------------|
| **Read-only** *(default)* | `--permission-mode plan` | Reuses the proven read-only "ask" lane mechanism already in `CreateProcessInfo` — structurally blocks every mutation in headless mode. High confidence (verified live). |
| **Edit-only** | `--permission-mode acceptEdits --disallowedTools Bash WebFetch WebSearch` | Repo-scoped editing with **no execution**: file edits within the working dir auto-flow, but `Bash` — the only primitive for running scripts/exes — and the network tools are denied. File tools stay confined to the working dir by Claude Code's own cwd scoping. **Verified live**: edits land, Bash blocked. |
| **Standard** | `--settings '<deny-list JSON>'` (default permission mode otherwise) | = today's behavior **plus** a hard deny-list for destructive/exfil actions. Only *adds* denies, so it can't accidentally widen. Deny-wins is documented + low-risk. |
| **Full access** | *(none)* | Today's exact behavior — default mode, the repo's own settings apply. The Operator's deliberate "no added restriction" choice. |

Restrictiveness order (most → least), for the most-restrictive-wins rule below:
**Read-only > Edit-only > Standard > Full**.

**Standard deny-list (initial, tunable):** `Bash(rm:*)`, `Bash(rmdir:*)`, `Bash(sudo:*)`,
`Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `WebFetch`.
Curated and conservative; lives in one constant so it's a one-line tweak. The exact set is
**verified against the live CLI** during the verify task — the *structure* is what this change
locks in, not the final rule list.

## Decision — pass the resolved policy string, not `repoId`, into the runner

`CreateProcessInfo` is `static` and has no access to the registry. Rather than thread `repoId`
*and* a registry dependency into it, the **policy string is resolved upstream** where the repo is
already in hand (`ChatController` already calls `_repos.Current()`), and passed down:

```
ChatController (has repo.PermissionPolicy)
  → CliRunnerService.RunAsync(..., string? permissionPolicy)
    → CreateProcessInfo(..., string? permissionPolicy)
      → PermissionFlags(permissionPolicy, readOnly)  // maps to argv
```

`PermissionFlags` centralizes the table above and the precedence rule.

## Decision — precedence (most-restrictive wins)

The existing read-only **ask lane** (`readOnly == true`) already forces `--permission-mode plan`.
The per-repo policy composes with it as **most-restrictive-wins**:

- `readOnly==true` **or** policy `Read-only` → `plan` (read-only) regardless of the other.
- else policy `Standard` → deny-list `--settings`.
- else policy `Full` → nothing.

So an ask-lane conversation stays read-only even on a `Full` repo (decision F).

## Decision — default is Read-only, and it applies to EXISTING repos too

`RepositoryConfig.PermissionPolicy` is nullable; **null ⇒ Read-only**. There is no migration
backfill — every repo already in `repositories.json` has no value, so **on first run after this
ships, every project's chat is Read-only until the Operator opts it up** (including `birocode`
itself / self-dev). This is the confirmed "safe by default" posture, but it is a real,
**visible behavior change** — called out in the verify step and the ship note so the Operator
knows to set their active projects to Standard/Full.

## Data model & persistence

- `RepositoryConfig.PermissionPolicy` (string?, one of `"readonly" | "standard" | "full"`),
  persisted in the existing `%APPDATA%\ClaudeWeb\repositories.json` via `RepositoryRegistry.Save()`
  (atomic temp+rename — no new store, mirrors `IpAllowlistService`).
- Surfaced on the `RepositoryInfo` DTO so `ChatController` (and the web, read-only) can read it.
- A **desktop-only** setter `RepositoryRegistry.SetPermissionPolicy(id, policy)` — the web API
  never mutates it (mirrors the IP-allowlist "GUI mutates, web reads" invariant, decision D).

## Desktop GUI

`UI/RepositoriesForm.cs` gains a **per-row preset selector** (a ComboBox: Read-only / Standard /
Full) wired to `SetPermissionPolicy`. Same modal/operator-only surface as the project list and
the IP `IpFilterForm`. No web UI for editing (decision D).

## Scope

Only the direct chat `claude -p` path (`CliRunnerService`). The structured-ask gateway is
**verified** to take no End-User free-text (fixed compile-time prompt; `LocalAppsController.Discover`
has no body), so it's out of scope with no injection exposure (decision E).

## Alternatives rejected

- **`bypassPermissions` / `acceptEdits` for Standard/Full** — headless semantics are harder to
  predict (could silently over- or under-permit); the additive deny-list is safer and testable.
- **Thread `repoId` + registry into the static `CreateProcessInfo`** — more coupling than passing
  the already-resolved policy string down.
- **Inline `--settings` for every preset** — only Standard needs it; Read-only reuses `plan`,
  Full needs nothing.
