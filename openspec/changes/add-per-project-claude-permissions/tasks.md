# Tasks

## 1. Data model

- [x] 1.1 Add `PermissionPolicy` (string?, `"readonly" | "standard" | "full"`) to
      `Models/RepositoryConfig.cs`; null ⇒ Read-only (safe default).
- [x] 1.2 Surface it on the `RepositoryInfo` DTO in `Services/Repositories/RepositoryRegistry.cs`
      (populated in `ToInfo` via `NormalizePolicy`; also copied in `Clone`).

## 2. Registry (desktop-only mutation + persistence)

- [x] 2.1 Add `SetPermissionPolicy(string id, string? policy)` to `RepositoryRegistry`
      (+ `NormalizePolicy`), updating the record and calling the existing atomic `Save()`.
- [x] 2.2 Confirmed the web API has no path to this setter — `SetPermissionPolicy` is called only
      from `UI/RepositoriesForm.cs` (operator-only invariant, like the IP allowlist).

## 3. Enforcement on the chat `claude -p` call

- [x] 3.1 Added `ApplyPermissionFlags(psi, policy, readOnly)` + the `StandardDenySettings` constant
      in `CliRunnerService`: Read-only/ask-lane → `--permission-mode plan`; Standard →
      `--settings '<deny-list JSON>'`; Full → none.
- [x] 3.2 Added a `permissionPolicy` param to `RunAsync` and `CreateProcessInfo`; replaced the
      `readOnly`-only block with `ApplyPermissionFlags` (most-restrictive-wins).
- [x] 3.3 `Controllers/ChatController.cs` reads `repo.PermissionPolicy` and passes it into `RunAsync`.
- [x] 3.4 Add the **Edit-only** preset (repo-scoped, no execution): an `"editonly"` branch in
      `ApplyPermissionFlags` → `--permission-mode acceptEdits --disallowedTools Bash WebFetch
      WebSearch`; accept `"editonly"` in `NormalizePolicy` and the desktop `Presets` list. Verified
      live (edits land, Bash blocked).

## 4. Desktop GUI

- [x] 4.1 `UI/RepositoriesForm.cs` gains a "Permissions…" button → modal preset chooser (ComboBox:
      Read-only / Standard / Full) wired to `RepositoryRegistry.SetPermissionPolicy`.
- [x] 4.2 A "Chat permissions" column shows each project's current preset (default Read-only when unset).

## 7. Web dashboard badge (read-only reflection of the desktop-set preset)

- [x] 7.1 Expose the preset on the web API: add `permissionPolicy = r.PermissionPolicy` to the
      `GET /api/repos` payload in `Controllers/RepoController.cs` (read-only; no setter added).
- [x] 7.2 New `components/dashboard/PermissionBadge.jsx` — display-only pill mapping the preset →
      short code + color + descriptive title (RO/EO/STD/FULL; unknown → Read-only, matching backend).
- [x] 7.3 Render it on both dock surfaces: the card cell head in `pages/Dashboard.jsx` and the phone
      bar in `components/dashboard/PinnedAgent.jsx` (preset read from the `repos` list by repoId).
- [x] 7.4 Register `permissionBadge: 'advanced'` in `context/UiModeContext.jsx` (new features default
      to Advanced; the whole dashboard is Advanced-gated already). Badge CSS in `pages/dashboard.css`.
- [x] 7.5 Frontend builds clean (`npm --prefix client run build`).

## 5. Verify

- [x] 5.1 Backend compiles (`dotnet build` to an isolated dir) — **0 errors**. No frontend changes in
      this feature. Confirmed via `claude --help` that `--settings` accepts **inline JSON** (so the
      Standard preset's inline policy is valid).
- [ ] 5.2 Verify each preset against the **live CLI** (per `docs/claude-web/browser-testing.md`):
      Read-only blocks an edit/bash; Standard allows an edit but blocks a denied destructive
      command; Full behaves as before. Confirm an ask-lane turn stays read-only on a Full project.
      Tune the Standard deny-list if a rule doesn't bind as expected. **Pending — needs the harness running.**
- [ ] 5.3 Confirm the desktop "Permissions…" selector persists across a restart (reads back from
      `repositories.json`). **Pending — needs the desktop app running.**
- [x] 5.4 `openspec validate add-per-project-claude-permissions --strict` passes.

## 6. Understanding app

- [x] 6.1 `understanding-app/index.html` overwritten with the interactive companion (flow, presets,
      per-project, decisions) — already done at the proposal stage.
