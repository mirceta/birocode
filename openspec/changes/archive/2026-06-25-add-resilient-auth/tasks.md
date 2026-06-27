# Tasks

> Implements **Approach B — strict gate + trusted-device cookie** (see `design.md`). The strict
> `403` is preserved for strangers; the cookie is the only new admit path, and it is revocable.

## 1. Trusted-device token service

- [x] 1.1 Add a `DeviceTokenService` (or extend `AuthService`): issue a 256-bit token, store its
      SHA-256 hash server-side (`devices.json`, beside `sessions.json`) tagged with name + issued/last-seen.
- [x] 1.2 `ValidateAndSlide(token)` — hash-compare (no PBKDF2), renew sliding expiry on use.
- [x] 1.3 `Revoke(tokenId)` and `RevokeByName(name)`; persist atomically like sessions.

## 2. Mint on first admitted entry

- [x] 2.1 On successful `POST /api/auth/login` (which, by construction, came from an approved IP),
      set `claudeweb_device`: HttpOnly, Secure, SameSite, long sliding Max-Age.
- [x] 2.2 Never mint on a request the IP gate rejected — guarded on `IsApproved(ip)` + "no valid cookie yet".

## 3. Gate admits approved IP OR valid device cookie

- [x] 3.1 In `IpFilterMiddleware`, before the `403`, check for a valid `claudeweb_device` cookie via
      `DeviceTokenService.ValidateAndSlide`; if valid → pass.
- [x] 3.2 Otherwise → the existing hard `403` + standalone rejection page, byte-for-byte as today.
- [x] 3.3 Visibility: cookie-admitted source IP recorded on the device record (`LastIp`, shown in the
      "Trusted devices" list) — chosen over auto-adding to the allowlist so the cookie stays the controlled bypass.

## 4. Revocation surfaces

- [x] 4.1 Desktop `IpFilterForm`: a "Trusted devices" list (name, last-seen, last IP, issued) with per-device
      Revoke.
- [x] 4.2 "Remove guest" prompts to also revoke that person's device tokens.

## 5. Config

- [x] 5.1 Add `DeviceCookieDays` (default 180) to `appsettings.json` + `Models/AppConfig.cs`; wired into
      the cookie Max-Age and the sliding window.

## 6. Remove the per-project permission system

- [x] 6.1 `CliRunnerService` — deleted `ApplyPermissionFlags` + `StandardDenySettings`; no longer
      threads `permissionPolicy`; chat runs with no `--permission-mode` / deny `--settings` injected.
- [x] 6.2 `ChatController` — no longer reads/threads `repo.PermissionPolicy`; the user-selectable
      read-only "ask" mode is kept as-is.
- [x] 6.3 `RepositoryConfig` / `RepositoryRegistry` — removed `PermissionPolicy`, `NormalizePolicy`,
      `SetPermissionPolicy`; existing `repositories.json` loads with any stored field ignored.
- [x] 6.4 `RepoController` — dropped `permissionPolicy` from `GET /api/repos`.
- [x] 6.5 Desktop `RepositoriesForm` — removed the "Chat permissions" column, the "Permissions…"
      button, and the preset dialog.
- [x] 6.6 Frontend — deleted `PermissionBadge.jsx` + its dock usage (Dashboard, PinnedAgent); dropped
      `permissionBadge` from the UiMode feature map.
- [x] 6.7 Docs/spec — handled by this change's `project-permissions` REMOVED delta (folds in on archive).
- [x] 6.8 README — added a "Security: the trust boundary is the harness's OS account" section
      recommending a dedicated least-privilege Windows account (self-dev.md is auto-managed, so README).

## 7. Verify

> Both builds are green (`dotnet build` 0 errors; `vite build` ok). This repo has **no test
> project** (manual/headless verification throughout), so 7.1 is recorded as compile + reasoned
> verification; 7.2/7.4 need the running app + a phone and are left for the Operator.

- [x] 7.1 No test project in the repo (an xUnit suite is a separate decision), so verified by a
      **runtime smoke test** — isolated instance (own port + `CLAUDEWEB_DATADIR`), curl: health 200;
      unapproved IP no-cookie → 403; approved login → 200 + `claudeweb_device` set (HttpOnly,
      SameSite, 180d); unapproved IP + valid cookie → 200 (bypass); unapproved IP + bogus cookie →
      403; second login with cookie → no re-mint; `devices.json` holds one hashed token tagged
      "localhost" with the admitted `LastIp`. Revoke/RevokeByName remain code-verified (desktop-only).
- [x] 7.2 Manual (Operator): **confirmed on a real phone** — logged in on Wi-Fi (cookie minted), switched
      to 4G (new carrier IP), stayed in with no desktop action. The 4G-rescue works end-to-end on the
      live deploy.
- [x] 7.3 `127.0.0.1` seed is untouched (`IpAllowlistService.Load` still seeds it) — host never self-locked.
- [x] 7.4 Permission removal — **runtime-confirmed** `GET /api/repos` no longer emits
      `permissionPolicy` (smoke test); preset picker + web badge removed; `RepositoryConfig` drops the
      field so old `repositories.json` loads (System.Text.Json ignores the unknown key). The behavioural
      check (a formerly Read-only project now edits + runs shell) rides along with the 7.2 phone session.
