# Tasks

> Implements **Approach B — strict gate + trusted-device cookie** (see `design.md`). The strict
> `403` is preserved for strangers; the cookie is the only new admit path, and it is revocable.

## 1. Trusted-device token service

- [ ] 1.1 Add a `DeviceTokenService` (or extend `AuthService`): issue a 256-bit token, store its
      SHA-256 hash server-side (alongside `sessions.json`) tagged with name + issued/last-seen.
- [ ] 1.2 `ValidateAndSlide(token)` — hash-compare (no PBKDF2), renew sliding expiry on use.
- [ ] 1.3 `Revoke(tokenId)` and `RevokeByName(name)`; persist atomically like sessions.

## 2. Mint on first admitted entry

- [ ] 2.1 On successful `POST /api/auth/login` (which, by construction, came from an approved IP),
      set `claudeweb_device`: HttpOnly, Secure, SameSite, long sliding Max-Age.
- [ ] 2.2 Never mint on a request the IP gate rejected (it cannot reach login, but assert/guard it).

## 3. Gate admits approved IP OR valid device cookie

- [ ] 3.1 In `IpFilterMiddleware`, before the `403`, check for a valid `claudeweb_device` cookie via
      `DeviceTokenService.ValidateAndSlide`; if valid → pass.
- [ ] 3.2 Otherwise → the existing hard `403` + standalone rejection page, byte-for-byte as today.
- [ ] 3.3 (Optional visibility) on a cookie-admitted new IP, record it tagged
      `via device cookie: <name>` through `IpAllowlistService`.

## 4. Revocation surfaces

- [ ] 4.1 Desktop `IpFilterForm`: a "Trusted devices" list (name, issued, last-seen) with per-device
      Revoke.
- [ ] 4.2 "Remove guest" prompts to also revoke that person's device tokens.

## 5. Config

- [ ] 5.1 Add `DeviceCookieDays` (default e.g. 180) to `appsettings.json` + `Models/AppConfig.cs`; wire into
      the cookie Max-Age and sliding window.

## 6. Verify

- [ ] 6.1 Integration tests: approved-IP pass; unapproved-IP + valid cookie pass (+ optional record);
      unapproved-IP + no cookie → `403` + rejection page; unapproved-IP + revoked/expired cookie →
      `403`; cookie minted only on an admitted login, never on a `403`'d attempt; revoke → device
      `403`s next time; sliding-expiry renews on use.
- [ ] 6.2 Manual: phone approved once → confirm cookie set → Wi-Fi→4G IP change keeps access with no
      desktop action → clear cookies → confirm new-IP visit is `403`'d → revoke device in GUI →
      confirm next new-IP visit is `403`'d.
- [ ] 6.3 Confirm `127.0.0.1` stays seeded/approved so the host is never self-locked.
