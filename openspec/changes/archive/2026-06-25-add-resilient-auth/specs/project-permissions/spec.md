# project-permissions

## REMOVED Requirements

### Requirement: Per-project permission preset set from the desktop app

**Reason**: The access model is being redefined so that the two auth gates are the entire
authorization system; a second per-project trust tier inside an already-authenticated session is
redundant for a single-Operator harness with hand-approved devices.

**Migration**: Drop `RepositoryConfig.PermissionPolicy` and the desktop preset picker. Existing
`repositories.json` records load unchanged with the field ignored.

### Requirement: The web dashboard reflects each project's preset read-only

**Reason**: With presets removed there is nothing to reflect.

**Migration**: Remove `permissionPolicy` from the `GET /api/repos` response and delete the
read-only `PermissionBadge` from the web Dashboard.

### Requirement: Unconfigured projects default to the safe Read-only preset

**Reason**: There is no preset to default; every passed-both-gates session is fully trusted.

**Migration**: None — the safe-default behaviour is intentionally replaced by full access (see the
`access-control` delta: authorization ends at the two gates).

### Requirement: The project's preset scopes its chat `claude -p` calls

**Reason**: Chat calls now run unrestricted; no permission flags are injected.

**Migration**: Remove `CliRunnerService.ApplyPermissionFlags` and `StandardDenySettings`, and stop
threading `permissionPolicy` through `ChatController` / `CliRunnerService`.

### Requirement: Most-restrictive wins between the ask lane and the preset

**Reason**: With presets removed, only the user-selectable read-only "ask" mode remains; there is no
preset to combine it with.

**Migration**: Keep the ask-lane read-only behaviour as a user-chosen mode; remove the
preset-combination logic.

### Requirement: Scope is the direct chat path only

**Reason**: Removed alongside the rest of the capability.

**Migration**: None.
