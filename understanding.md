# Make the redeploy procedure reproducible (seed deploy scripts on first run)

## The goal
Right now the harness's redeploy/rollback tooling **cannot be reproduced on another
machine**. The scripts (`swap.ps1`, `rollback.ps1`, `arm.ps1`) and the
`deploys.jsonl` ledger live in an **off-repo sibling dir**
(`playground/claudeweb-rollback`), are **not in git**, and are **full of hardcoded
absolute paths** tied to this box's user profile. The committed `DeployService.cs`
just *assumes* they exist. So a fresh checkout has the Deployments tab + rollback
code but none of the tooling it drives.

## What I'll do
Make the app **seed the scripts itself on first run**, the same way
`AuthService.LoadOrSeed()` seeds `auth.json` — so the tooling travels with the repo
and self-installs per machine.

1. **Commit the scripts as templates** (tracked, embedded resources) under
   `ClaudeWeb.App/Deploy/templates/{swap,rollback,arm}.ps1.tmpl`, with the
   machine-specific bits replaced by tokens `__REPO__` and `__DEPLOYDIR__`.
2. **New `DeployScriptProvisioner`** (Services/Deploy): on startup, ensure the
   deploy dir exists and write any **missing** script from its template, with the
   tokens substituted for *this* machine's repo root + deploy dir.
   **Never overwrites an existing script** — so this box's live tooling is untouched.
3. **Make `DeployScriptsDir` portable**: default it to empty and resolve at runtime
   to `<parent-of-repo>/claudeweb-rollback`. On this box that resolves to the
   *existing* `playground/claudeweb-rollback`, so behavior here is unchanged;
   on a fresh machine it lands next to that machine's repo.
4. **Wire it into `Program.cs`** after the self-repo is known, before the API starts.
5. Update the `DeployService` doc comment ("both already exist" → "seeded by
   `DeployScriptProvisioner` if missing").

## Why this shape (and what it preserves)
- Keeps the **runtime location off-repo** (the documented rollback-safety rationale
  in `AppConfig.cs`: rollback reverts the tree, so its own scripts must live outside
  it) — only the **canonical templates** are in-repo.
- Follows the existing **LoadOrSeed-on-startup** pattern used across the app.
- **Backward compatible / safe on this box**: missing-only writes + a default path
  that resolves to the current dir means the live deploy keeps working unchanged.

## Assumptions
- Templates faithfully mirror the current scripts; only the hardcoded paths become
  tokens (logic, the origin/main gate, robocopy /MIR, health check, ledger writes
  all preserved verbatim).
- Doc/runbook (via `PreviewDoc.cs`) + CLAUDE.md pointer is a **follow-up**, not part
  of this change, unless you want it now.
- This is a build-verify change; I will **not** deploy — that's your "deploy" step.
