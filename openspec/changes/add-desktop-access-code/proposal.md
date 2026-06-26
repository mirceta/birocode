# Set the access code from the desktop app

## Why

The harness's access code (the shared login password) is **seeded** from `appsettings.json`
(`AuthPassword`) on first run, then hashed (PBKDF2-SHA256) into `%APPDATA%\ClaudeWeb\auth.json`;
after that the config value is ignored. Today it can be changed over the **web** via
`POST /api/auth/password` (any authed client that knows the current code) — but it **cannot** be
changed from the **WinForms desktop app**, the operator's own control surface that already holds
elevated authority (the only place that can approve IPs and revoke trusted devices).

That's backwards: changing the access code is the most sensitive control there is, so it should be
restricted to whoever has **physical access to the host PC**, not any logged-in web client. This
change moves the access code to **desktop-only**: it adds a desktop setter and **removes the web
change endpoint** entirely.

## What Changes

- **`AuthService.SetPassword(next)`** — a desktop-authority setter that sets the access code
  **without** requiring the current one (the operator at the host PC is trusted), revoking all active
  sessions so everyone re-authenticates. Mirrors the existing `ChangePassword` but drops the
  current-code check, matching the desktop-only authority already used for IP approval.
- **A "Set access code" button** on the main WinForms window, opening a small dialog (new code +
  confirm, masked) that calls `SetPassword` and reports success/validation errors.
- **Remove the web change endpoint.** Delete `POST /api/auth/password` (`AuthController.ChangePassword`)
  and the now-unused `AuthService.ChangePassword`. There is no web/phone way to change the access code.
- **Wiring:** `AuthService` becomes a pre-built singleton in `Program.cs` (like `IpAllowlistService` /
  `DeviceTokenService` / `AuditService`) so the desktop GUI and the web API share one instance.

## Impact

- **Affected specs:** `access-control` (MODIFIED — adds the desktop access-code setter requirement).
- **Affected code:** `ClaudeWeb.App/Services/Auth/AuthService.cs` (`SetPassword`; **remove**
  `ChangePassword`); `ClaudeWeb.App/Controllers/AuthController.cs` (**remove** `POST /api/auth/password`);
  `ClaudeWeb.App/Services/Auth/AuthModuleExtensions.cs` (register the pre-built instance);
  `ClaudeWeb.App/Program.cs` + `Services/Hosting/EmbeddedApi.cs` (pre-build + share);
  `ClaudeWeb.App/UI/MainForm.cs` (button + dialog); `Models/AppConfig.cs` (doc).
- **Security note:** setting the code revokes all sessions (everyone re-enters the new code). It does
  **not** revoke trusted-device cookies — those bypass the IP gate, not the password, so a device
  still skips the IP gate but must enter the new code. Changing the code now requires **physical
  access to the host PC**; no web/phone path can change it. Logged to the action audit as an operator
  auth event.
- **Out of scope:** the `X-Auth-Password` header (tooling *authentication*, not changing the code) and
  `POST /api/auth/login` are unchanged — this change only removes the *change-the-code* web path.
