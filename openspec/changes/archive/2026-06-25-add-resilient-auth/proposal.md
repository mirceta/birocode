# Resilient auth — keep the strict IP gate, rescue returning friends with a trusted-device cookie

## Why

The Operator *wants* the strict gate. The current design is correct in spirit: an unknown
visitor is hard-`403`'d before they can reach anything, and the Operator personally approves a
new person's IP from the desktop GUI. That manual first-approval is a **feature**, not the
problem — it is how "only my friends get in" is enforced.

The **one** real defect is this: the gate keys on **IP**, but identity is a **person/device**.
On 4G/5G the carrier rotates a phone's public IP routinely, so a friend the Operator *already
approved* is re-barred the moment their IP changes — even though they are the same person on the
same device. Today the only cure is another phone call and another walk to the host PC. The gate
is forgetting a device it already trusted, purely because the network handed it a new address.

The fix is to remember the **device**, not the address. When a person is admitted for the first
time (because the Operator approved their IP), mint a long-lived, HttpOnly **trusted-device
cookie** on that device. Thereafter the IP gate accepts **either** an approved IP **or** a valid
trusted-device cookie. A rotated 4G IP no longer matters — the cookie carries the device
through. An unknown visitor with no cookie still hits the same hard `403` and still has to be
approved by the Operator. Nothing is loosened for strangers; a trusted device simply stops being
forgotten.

## What Changes

- **Mint a trusted-device cookie on first approved entry.** When a request succeeds from an
  Operator-approved IP (i.e. a real admitted entrance, optionally after the password step), the
  server issues `claudeweb_device` — a high-entropy, HttpOnly, Secure, long-lived (sliding)
  cookie whose hash is stored server-side. Because unapproved IPs are `403`'d *before* they can
  reach this point, only people the Operator actually let in can ever obtain one.
- **The IP gate accepts an approved IP OR a valid device cookie.** Any other request — unknown
  IP with no valid cookie — gets the **same hard `403` + standalone rejection page as today**.
  There is no fall-through to the password screen for strangers.
- **Trusted devices are listed and revocable.** Device tokens are stored server-side (like
  sessions), tagged with the friend's name + issued/last-seen, and surfaced in a **"Trusted
  devices"** list in the desktop GUI with a Revoke button. Removing a guest also offers to revoke
  that person's device tokens — otherwise a cookie outlives the IP removal and the person cannot
  be fully evicted.
- **Optional visibility:** when a cookie-holder is admitted from a new IP, record that IP tagged
  `via device cookie: <name>` so the Operator can see and audit a friend's new addresses without
  a phone call.
- **The password/session layer is unchanged** and remains the second factor behind the gate, so
  a leaked cookie still faces the password.

### Also in this change: remove the per-project permission system

Since this change rewrites the access model, it also **removes the `project-permissions`
capability entirely**. The premise is deliberate: the two gates *are* the whole authorization
model. Anyone who clears both gates is fully trusted, and the only remaining boundary is the **OS
account the harness process runs as** — there is no second, in-app layer rationing what a passed
user may do.

- **Drop the per-project presets.** Remove the Read-only / Edit-only / Standard / Full preset, its
  storage (`RepositoryConfig.PermissionPolicy` in `repositories.json`), the desktop preset picker,
  and the read-only web badge.
- **Every chat runs unrestricted.** `CliRunnerService.ApplyPermissionFlags` stops injecting
  `--permission-mode` / deny-list `--settings` into `claude -p`; calls run at full access, bounded
  only by the harness's OS account.
- **Explicitly *not* removed** (these are not per-user authorization): the IP + password gates;
  `X-Repo-Id` repo routing; the basic/advanced repo **visibility** (UI-only); the **AutopilotGate**
  feature master-switch; and the user-*selectable* read-only "ask" mode (a chosen tool, not an
  imposed restriction). Any of these can be folded in later if wanted.

This is a real reduction in safety-by-default (see `design.md` → "Removing the permission system");
the recommended mitigation — running the harness under a **dedicated least-privilege OS account** —
is what makes "bounded by the OS account" a sized boundary rather than inherited admin rights.

The full set of alternatives considered — drop the IP gate, the earlier *soft fall-through* idea
(rejected: it would have exposed the login to strangers), a knowledge-based questionnaire
(rejected: weak), TOTP, passkeys/WebAuthn, Cloudflare Access / Tailscale, client-cert mTLS — and
the dimension-by-dimension comparison are in **`design.md`**.

## Impact

- **Affected specs:** `access-control` (new capability, seeded by this change's delta);
  `project-permissions` (**removed** — its requirements are deleted via this change's delta and the
  baseline spec is dropped on archive).
- **Affected code (removed):** `ClaudeWeb.App/Models/RepositoryConfig.cs` (`PermissionPolicy` field);
  `ClaudeWeb.App/Services/Repositories/RepositoryRegistry.cs` (`PermissionPolicy` / `NormalizePolicy`
  / `SetPermissionPolicy`); `ClaudeWeb.App/Services/Chat/CliRunnerService.cs`
  (`ApplyPermissionFlags` + `StandardDenySettings` — runs unrestricted);
  `ClaudeWeb.App/Controllers/ChatController.cs` (stop threading `permissionPolicy`);
  `ClaudeWeb.App/Controllers/RepoController.cs` (drop `permissionPolicy` from `GET /api/repos`);
  `ClaudeWeb.App/UI/RepositoriesForm.cs` (preset picker + column);
  `client/src/components/dashboard/PermissionBadge.jsx` (delete) and its dock usage.
- **Affected code (edited):** `ClaudeWeb.App/Services/IpFilter/IpFilterMiddleware.cs` (admit on a
  valid device cookie as well as an approved IP; otherwise `403` exactly as today);
  `ClaudeWeb.App/Services/Auth/AuthService.cs` + `AuthController.cs` (mint/validate/revoke the
  device token, store its hash server-side); `appsettings.json` / `Models/AppConfig.cs` (cookie lifetime);
  `ClaudeWeb.App/UI/IpFilterForm.cs` (a "Trusted devices" list with Revoke; revoke-on-guest-removal
  prompt); optionally `IpAllowlistService.cs` (record cookie-origin IPs for visibility).
- **Affected code (frontend):** none required — the cookie is set/read server-side and the
  existing `PasswordGate` flow is untouched. The Guests tab optionally badges cookie-origin IPs.
- **Out of scope:** passkeys, TOTP, magic-links, and network-layer offloading remain documented
  alternatives/follow-ups in `design.md`, not built here. No change to the PBKDF2/throttle internals.
- **Security note (surfaced per the repo's first convention):** this change *preserves* the strict
  IP gate from `plans/auth-ip-filter.md` for strangers — it does **not** soften it. The only new
  *exposure* is that a **stolen, un-revoked, HttpOnly device cookie** can skip the IP check from a new
  address; `design.md` quantifies that delta and the mitigations (HttpOnly+Secure, server-side
  revocation, the password second factor, device≠person re-approval on a wiped device).
- **Security note 2 — removing `project-permissions` (surfaced per the repo's first convention):**
  this knowingly inverts the spec's documented *safe-by-default Read-only* posture to **full access
  by default**, and deletes the Standard denylist that blocked destructive/exfiltration shell
  (`rm -rf`, `git push --force`, `curl`/`wget`). Combined with the cookie, the worst-case blast
  radius of a compromised cookie+password grows from "read-only on one repo" to **full control of
  the machine as the harness's OS account**. This is an accepted trade (the two gates are the whole
  trust model); the mitigation of record is to run the harness under a **dedicated least-privilege
  OS account** so that boundary is sized deliberately. The End User never authenticates to Windows,
  so the boundary is the *harness process's* account, not any per-user OS identity.
