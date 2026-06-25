# Design — keep the strict gate, stop forgetting trusted devices

## The problem, precisely

The strict IP gate is *wanted*: an unknown visitor is hard-`403`'d before reaching anything, and
the Operator personally approves a new person from the desktop GUI. That manual first-approval is
the feature, not the bug — it is how "only my friends get in" is enforced.

The single defect is a **key mismatch**: the gate authorises by **IP address**, but the thing the
Operator actually trusts is a **person on a device**. Carrier NAT rotates a phone's public IP
routinely, so an already-approved friend is re-barred on every rotation despite being the same
device. The cure today is another phone call and another walk to the host PC.

So the design question is narrow: **how does the gate remember a device it already admitted, so a
new IP for that device is a non-event — without admitting anyone the Operator did not approve?**
The answer is a trusted-device cookie that the IP gate accepts *in addition to* an approved IP.
Below are the seven approaches considered against that goal.

## The approaches

- **A — Drop the IP gate; rely on the password+session layer.** Delete `IpFilterMiddleware`.
  Smallest change, but discards the strict "strangers never reach the app" property the Operator
  explicitly values.
- **B — Strict gate + trusted-device cookie *(recommended)*.** Keep the gate and its hard `403`
  unchanged for strangers. On a person's *first* admitted entry (from an Operator-approved IP),
  mint a long-lived HttpOnly `claudeweb_device` cookie. The gate then admits **approved IP OR
  valid device cookie**; everything else is `403` exactly as today. Remembers the device, not the
  address; preserves manual first-approval.
- **C — TOTP / authenticator 2FA.** Orthogonal security upgrade; does *not* fix the IP friction by
  itself. A second factor on login, layered on A or B.
- **D — Passkeys / WebAuthn.** Replace/augment the password with a device passkey (Face ID). Best
  long-term security & phone UX; biggest build; needs a recovery path. A natural *follow-up* to B.
- **E — Email magic-link / one-time code.** Operator-free and IP-independent, but adds an SMTP
  dependency and an inbox hop per login.
- **F — Network-layer offload (Cloudflare Tunnel + Access, or Tailscale).** Move auth to the
  edge/VPN; IP becomes irrelevant. Strongest isolation, least app code, but a standing external
  dependency and infra lock-in.
- **G — Client certificate (mTLS).** Provision a cert per phone; IP-independent and strong, but
  brittle mobile install/renewal/revocation and poor UX.

## Comparison

Ratings are relative to *this* codebase and use-case (single Operator, a handful of trusted
phones, internet-reachable via IIS/ARR, **manual first-approval is desired**). **Dev effort** =
code + integration; **Dev risk** = chance of self-lockout/regression while building; **Fixes IP
friction** = removes the 4G re-bar of an already-approved person; **Security** = strength of the
internet-facing door; **Phone UX** = End-User friction per visit; **Operator burden** = ongoing
host-side work *after* the wanted first-approval; **External deps** = new standing
dependencies/infra; **Reversibility** = how easily undone.

| # | Approach | Dev effort | Dev risk | Fixes IP friction | Security | Phone UX | Operator burden | External deps | Reversibility |
|---|----------|-----------|----------|-------------------|----------|----------|-----------------|---------------|---------------|
| **A** | Drop IP gate | **Very low** | Low–Med (loses the strict gate) | ✓ Fully | Med (one layer) | Good | None | None | Easy |
| **B** | **Strict gate + trusted-device cookie** *(rec.)* | **Low–Med** | **Low** (only *remembers* approved devices; strangers untouched) | ✓ Fully | **High** (strict gate kept; cookie HttpOnly + revocable) | **Good** | **1st-approve only** (then none) | None | Easy |
| **C** | TOTP 2FA | Med | Med | ✗ Not alone | High (with A/B) | Fair | Low | Authenticator app | Med |
| **D** | Passkeys / WebAuthn | **High** | Med–High (device-loss recovery) | ✓ | **Highest** (phishing-resistant) | **Best** (Face ID) | Low | A FIDO2 library | Med |
| **E** | Email magic-link | Med | Med | ✓ Fully | Med–High | Fair | Low–Med | **SMTP/email** | Med |
| **F** | Cloudflare Access / Tailscale | Med (infra) | Med | ✓ Fully | **Highest** | Tailscale app / SSO | Med | **CF acct+domain / Tailscale** | Hard |
| **G** | Client cert (mTLS) | Med–High | High | ✓ Fully | High | **Poor** | Med | A CA | Hard |

### Overall star rating

A single weighted score, weighting toward what this decision is about: **removes the 4G re-bar ×
low risk/effort × *keeps* the strict gate the Operator values × no new standing dependency.**

| # | Approach | Overall | One-line rationale |
|---|----------|---------|--------------------|
| **B** | Strict gate + trusted-device cookie *(rec.)* | **★★★★½** | Fixes it completely while *preserving* the strict gate; lowest risk (only remembers already-approved devices); no deps; revocable; −½ for the cookie-revocation plumbing that must be done right |
| **D** | Passkeys / WebAuthn | **★★★★☆** | Best security + phone UX; −1 for biggest build + device-loss recovery. Best *follow-up* to B |
| **A** | Drop IP gate entirely | **★★★½☆** | Cheapest full fix; −1½ for discarding the strict gate the Operator explicitly wants |
| **F** | Cloudflare Access / Tailscale | **★★★½☆** | Strongest isolation, least app code; −1½ for standing external dependency + infra lock-in |
| **E** | Email magic-link | **★★★☆☆** | Operator-free & IP-independent; −2 for an SMTP dependency + an inbox hop every login |
| **C** | TOTP 2FA | **★★½☆☆** | Good security upgrade but does **not** fix the friction alone — an add-on to A or B |
| **G** | Client cert (mTLS) | **★★☆☆☆** | Strong and IP-independent; −3 for brittle mobile cert provisioning and poor UX |

### How to read it for *this* decision

- The problem is "stop re-barring an already-approved person on IP change," **without** admitting
  anyone the Operator did not approve. That second clause is what rules out the cheap options.
- **A** fixes it but deletes the strict gate — exactly the property the Operator wants to keep.
- **B** fixes it just as completely while leaving the hard `403` intact for everyone the Operator
  hasn't approved. It only ever *remembers a device that was already admitted*; a stranger's
  experience is byte-for-byte unchanged. That "fix the friction, keep the strictness" combination
  is why it is recommended.
- **C, D** are *security upgrades*, not friction fixes; either layers on **after** B with no
  rework. **D (passkeys)** is the natural next step if passwordless phone login is wanted later.
- **E, F, G** trade the Operator's (wanted) first-approval for a *standing external dependency*.

## Recommended approach (B) — how it works

Today's pipeline `403`s an unapproved IP in the first middleware, before anything else:

```
IpFilterMiddleware  →  static/SPA  →  PasswordAuthMiddleware (/api/*)  →  controllers
   approved IP? no → hard 403 (even for a friend whose 4G IP just rotated)
```

B changes only the gate's admit test and adds a mint step:

1. **Mint on first admitted entry.** When a request is admitted from an Operator-approved IP and
   establishes a session (the existing password-login success is the clean moment), the server
   also sets `claudeweb_device`: a 256-bit random token, **HttpOnly**, **Secure**, **SameSite**,
   long-lived and **sliding**, whose SHA-256 hash is stored server-side alongside sessions. Since
   unapproved IPs are `403`'d before they can ever reach login, only admitted people get one.
2. **Gate admits approved IP OR valid device cookie.**
   - Approved IP → pass (unchanged).
   - Unapproved IP **with** a valid `claudeweb_device` cookie → **pass** (the 4G-rescue case);
     optionally record the new IP tagged `via device cookie: <name>` for visibility.
   - Unapproved IP **without** a valid cookie → **hard `403` + standalone rejection page, exactly
     as today.** No fall-through. Operator approves manually, as desired.
3. **Second factor unchanged.** A cookie-holder still meets `PasswordAuthMiddleware` for `/api/*`,
   so a leaked cookie alone does not grant app access — it only skips the IP check.

Mechanically the gate needs to validate the device cookie cheaply (a hash compare, not PBKDF2),
mirroring `AuthService.ValidateSession`. A `DeviceTokenService` (or an extension of `AuthService`)
owns issue / validate-and-slide / revoke and the server-side store.

## Four things that must be right

1. **Revocation is mandatory, not optional.** Once a friend holds a cookie, *removing their IP no
   longer evicts them*. So device tokens are stored server-side, tagged with the friend's name +
   issued/last-seen, shown in a **"Trusted devices"** list with per-device Revoke, and removing a
   guest prompts to revoke that person's tokens. Without this the Operator cannot fully evict
   anyone.
2. **The cookie proves the *device*, not the *person*.** New phone, cleared cookies, or
   private-browsing → no cookie → `403` → one more first-approval. That is intended: it is what
   keeps a wiped/lost phone from being a permanent backdoor.
3. **Lifetime vs re-approval.** Long and sliding (90–365 days) so the call-the-Operator event is
   rare; a quiet friend past the window re-approves once. Configurable.
4. **HttpOnly + Secure + SameSite.** The cookie now skips the IP gate, so it must be unreadable to
   JS (XSS) and HTTPS-only. The existing session cookie already sets this precedent.

## Why not A (delete the gate)?

A is almost free and fixes the friction, but it discards the property the Operator named as
valuable: *unauthenticated traffic never reaches the app at all.* B keeps that hard `403` for
everyone unapproved and adds exactly one new admit path — a device the Operator already let in.
For a known, small set of trusted phones, B is strictly more conservative than A for a few hours'
more work.

## Rejected alternatives (decision record)

- **Soft fall-through gate (an earlier draft of B).** *Let an unknown IP reach the login screen
  instead of `403`.* **Rejected:** it exposes the password endpoint to every internet scanner and
  contradicts the Operator's explicit wish to personally approve first entry. The strict `403`
  must stay; the cookie — not a softened gate — is the right rescue.
- **Knowledge-based questionnaire (KBA) — "questions only they'd know."** *Gate on shared-life
  trivia.* **Rejected:** it is a low-entropy, non-rotatable, semi-public password, and the people
  who share your life (partner, family, an ex) are precisely the most realistic attackers who
  *also* know the answers. A passphrase or passkey dominates it on entropy, rotatability, and
  secrecy. (Visualised in the Understanding app, tab ③.)

## Security delta of the recommended change (surfaced honestly)

B **does not weaken** the gate for strangers — their hard `403` is unchanged, so this is *more*
aligned with `plans/auth-ip-filter.md` than the original soft draft. The only new exposure: a
**stolen, un-revoked `claudeweb_device` cookie** can skip the IP check from a new address.
Mitigations: it is HttpOnly (immune to XSS reads) and Secure (HTTPS-only); it is revocable
server-side (the "Trusted devices" list); it only skips the *IP* check, so the PBKDF2 + throttle
password layer still stands behind it; and because it is device-bound, a wiped/lost phone simply
loses it and must be re-approved. This is the trade `proposal.md` flags under the repo's
"warn before breaking a convention" rule — here, knowingly making the gate trust a cookie as well
as an IP.

## Verification posture

- **Unit/integration:** approved-IP pass; unapproved-IP + valid cookie pass (+ optional IP record);
  unapproved-IP + no cookie → hard `403` + rejection page; unapproved-IP + *revoked/expired* cookie
  → `403`; cookie minted only on an admitted (approved-IP) login, never on a `403`'d attempt;
  revoking a device → that device `403`s from a new IP next time; sliding-expiry renews on use.
- **Manual (host eyeball):** from a phone, get approved once, confirm a `claudeweb_device` cookie is
  set; switch Wi-Fi→4G (new IP) and confirm continued access with **no** desktop interaction; clear
  cookies and confirm the new-IP visit is `403`'d again; revoke the device in the GUI and confirm
  the next new-IP visit is `403`'d.
- **Self-lockout guard:** B only ever *adds* an admit path for already-approved devices and leaves
  the desktop approve/remove path untouched; `127.0.0.1` stays seeded, so the host is never
  self-locked.

## Sources (research grounding for the alternatives)

- Passkeys/WebAuthn 2026 maturity & .NET support — [Microsoft Learn: WebAuthn passkeys in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/passkeys/?view=aspnetcore-10.0), [Node.js Passkeys & WebAuthn in 2026](https://www.hirenodejs.com/blog/nodejs-passkeys-webauthn-2026), [Corbado: Passkeys & WebAuthn PRF (2026)](https://www.corbado.com/blog/passkeys-prf-webauthn)
- Network-layer offload trade-offs — [Tailscale vs Cloudflare Tunnel (2026)](https://needtoknowit.com.au/blog/tailscale-vs-cloudflare-tunnels-for-remote-access/), [Cloudflare vs Tailscale comparison](https://tailscale.com/compare/cloudflare-access), [Tailscale vs Cloudflare Tunnel Zero Trust (2026)](https://tech.breakingcube.com/2026/05/02/tailscale-vs-cloudflare-tunnel-zero-trust-comparison/)
- KBA / security-questions weakness — NIST SP 800-63B guidance deprecating knowledge-based authentication.
