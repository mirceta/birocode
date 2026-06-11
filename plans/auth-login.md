# Session login — internet-grade auth

> **Status (2026-06-11):** Deployed to the live :5099 harness and confirmed by
> the End User. Browser-verified beforehand on the :5201 preview
> (`verify-auth-login.mjs`, 12/12 checks).

## Why

The harness is now exposed to the internet behind HTTPS. The old auth was a
single shared password sent in plaintext on every request (`X-Auth-Password`
header or `?pw=` query), stored raw in localStorage, compared non-constant-time,
with no brute-force protection — and the live password was the committed
default `changeme`. Since chat = code execution on the host, this needed a
proper login before exposure.

## ⚠️ Convention change (deliberate, user-approved 2026-06-11)

`plans/INTEGRATION.md` §4 documented the shared-password contract
(header or `?pw=`). This feature replaces it with session cookies;
`?pw=` is removed (it leaks into proxy logs). The `X-Auth-Password`
header continues to work as a secondary path for curl/Playwright tooling.
Still a single password, single user — not a user system.

## What

- `POST /api/auth/login { password }` → 256-bit random session token in an
  **HttpOnly, SameSite=Strict** cookie (`claudeweb_session`); `Secure` when
  the request came over HTTPS. Sliding 30-day expiry.
- `GET /api/auth/check` → `{ authenticated }` (exempt; drives the React gate).
- `POST /api/auth/logout` → revoke + delete cookie.
- `POST /api/auth/password { current, next }` → rotate the password
  (authed; revokes all other sessions).
- **Brute-force throttle**: per client IP (X-Forwarded-For aware), 5 free
  attempts, then exponential lockout (30 s doubling, capped 1 h) → 429 with
  `retryAfterSeconds`. Applies to both login and header auth.
- **Secrets at rest**: PBKDF2-SHA256 (210k iters) hash in
  `%APPDATA%\ClaudeWeb\auth.json`, seeded from `AppConfig.AuthPassword` on
  first run; after that the committed config value is ignored. Sessions
  persist token *hashes* in `%APPDATA%\ClaudeWeb\sessions.json` (survive
  restarts/deploys — devices stay logged in).
- Client: `PasswordGate` posts to login; `claudeweb_pw` is purged from
  localStorage and the `X-Auth-Password` header is no longer sent by the app —
  cookies flow automatically on same-origin fetches (incl. streams/blobs).

## Known limitation (out of scope here)

The off-box IIS proxy (89.212.3.156) forwards `/preview/` straight to the
Product on :5200, bypassing the harness — the harness cannot gate it. The
Product stays internet-reachable until the IIS rule is changed. The harness
API (chat/files/screen/git) is fully covered.

## Test impact

Playwright scripts that only call the API keep using `X-Auth-Password`.
Scripts that drive the UI can no longer fake the gate via
`localStorage claudeweb_pw` — they must POST `/api/auth/login` and install
the session cookie via `ctx.addCookies` (see
`.claudeweb-preview/playwright/verify-auth-login.mjs`).

## Verification

`.claudeweb-preview/playwright/verify-auth-login.mjs` on the :5201 preview.
NOTE: auth.json/sessions.json in %APPDATA% are shared with live — the test
must not change the password and must log out its own sessions.
