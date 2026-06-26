# Set the access code from the desktop app

## Why

The harness's access code (the shared login password) is **seeded** from `appsettings.json`
(`AuthPassword`) on first run, then hashed (PBKDF2-SHA256) into `%APPDATA%\ClaudeWeb\auth.json`;
after that the config value is ignored. The only way to change it is the **web** endpoint
`POST /api/auth/password`, which requires knowing the *current* code.

There is no way to set it from the **WinForms desktop app** — the operator's own control surface,
which already holds elevated authority (it's the only place that can approve IPs and revoke trusted
devices). An operator who has forgotten the code, or is setting one for the first time, has no
recourse short of editing files. The access code should be settable right where the operator already
manages access.

## What Changes

- **`AuthService.SetPassword(next)`** — a desktop-authority setter that sets the access code
  **without** requiring the current one (the operator at the host PC is trusted), revoking all active
  sessions so everyone re-authenticates. Mirrors the existing `ChangePassword` but drops the
  current-code check, matching the desktop-only authority already used for IP approval.
- **A "Set access code" button** on the main WinForms window, opening a small dialog (new code +
  confirm, masked) that calls `SetPassword` and reports success/validation errors.
- **Wiring:** `AuthService` becomes a pre-built singleton in `Program.cs` (like `IpAllowlistService` /
  `DeviceTokenService` / `AuditService`) so the desktop GUI and the web API share one instance.

## Impact

- **Affected specs:** `access-control` (MODIFIED — adds the desktop access-code setter requirement).
- **Affected code:** `ClaudeWeb.App/Services/Auth/AuthService.cs` (`SetPassword`);
  `ClaudeWeb.App/Services/Auth/AuthModuleExtensions.cs` (register the pre-built instance);
  `ClaudeWeb.App/Program.cs` + `Services/Hosting/EmbeddedApi.cs` (pre-build + share);
  `ClaudeWeb.App/UI/MainForm.cs` (button + dialog).
- **Security note:** setting the code revokes all sessions (everyone re-enters the new code). It does
  **not** revoke trusted-device cookies — those bypass the IP gate, not the password, so a device
  still skips the IP gate but must enter the new code. The setter is desktop-only; no web endpoint
  gains the no-current-code power. Logged to the action audit as an operator auth event.
- **Out of scope:** the existing web `POST /api/auth/password` (current-code-required) is unchanged.
