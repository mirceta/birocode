# Tasks

## 1. Service

- [x] 1.1 `AuthService.SetPassword(next)` — no current-code check (desktop authority); min-length
      validate; `HashPassword` → `SaveAuth`; bump `PasswordVersion`; clear + save all sessions.

## 2. Share AuthService with the GUI

- [x] 2.1 Pre-built `AuthService` in `Program.cs`; passed to `EmbeddedApi` + `MainForm`.
- [x] 2.2 `AddAuthModule(AuthService)` registers the pre-built instance (dropped `AddSingleton<AuthService>()`).

## 2b. Remove the web change path

- [x] 2.3 Delete `POST /api/auth/password` (`AuthController.ChangePassword` + `ChangePasswordRequest`)
      and the now-unused `AuthService.ChangePassword`. The access code is not changeable over the web.

## 3. Desktop surface

- [x] 3.1 "Set access code" button on `MainForm` → dialog (new + confirm, masked) → `SetPassword`;
      reports success / validation / mismatch.
- [x] 3.2 Logs an operator auth event to the action audit (`access-code-set`).

## 4. Verify

- [~] 4.1 Build green; isolated smoke test confirms the rewired shared `AuthService` still authenticates
      (login 200, wrong 401) and the web `POST /api/auth/password` is unchanged (still gated/current
      required). The desktop "Set access code" button itself is GUI-triggered — verify on the host.
