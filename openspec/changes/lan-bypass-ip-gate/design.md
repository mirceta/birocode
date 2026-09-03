# Design — LAN bypass for the IP gate

## D1. Where the decision lives

`IpFilterMiddleware.InvokeAsync` gains one branch, evaluated **after** the
allowlist and **before** the device cookie:

```
origin = ClientIp.GetOrigin(ctx)          // ip + proxy facts
if allowlist.IsApproved(origin.Ip)        → admit (records access)      [unchanged]
if LanBypass.Match(origin) is cidr        → admit, log "via LAN bypass"  [new]
if device cookie valid                    → admit, slide                 [unchanged]
if hub token path                         → next                         [unchanged]
else                                      → 403 + record attempt         [unchanged]
```

Allowlist first so an approved LAN guest keeps its last-access bookkeeping;
LAN before device so a LAN request never slides a device token it does not need.
LAN admissions go through `PassAsync` (connection registry) like every other
admission; they do not touch the allowlist (no access record, no attempt).

## D2. `ClientOrigin` — the facts the bypass needs

`ClientIp.Get` stays as is (one string, used by the throttle, the allowlist, the
controllers). A new `ClientIp.GetOrigin(HttpContext)` returns

```
record ClientOrigin(string Ip, bool PeerIsTrustedProxy, bool Forwarded)
```

- `Ip` — identical to `Get`: last `X-Forwarded-For` hop when the socket peer is
  loopback or a configured trusted proxy, else the socket address.
- `PeerIsTrustedProxy` — the socket peer was loopback or in `TrustedProxyIps`.
- `Forwarded` — a non-empty last hop was taken from `X-Forwarded-For`.

`Get` is re-expressed as `GetOrigin(ctx).Ip` so the two can never disagree.

## D3. `LanBypass` — static, configured once, pure

```
static class LanBypass
  Configure(AppConfig)                       // parse LanBypassCidrs, log bad entries
  IReadOnlyList<string> Cidrs                // as configured (normalised text)
  string? Match(ClientOrigin origin)         // the matching cidr text, or null
  string? MatchIp(string ip)                 // range test only (controllers)
```

`Match` returns null when `origin.PeerIsTrustedProxy && !origin.Forwarded`
(D4), otherwise `MatchIp(origin.Ip)`. Parsing: `a.b.c.d/n`, `x::/n`, or a bare
address (= /32 or /128). IPv4-mapped IPv6 is folded to IPv4 first (same
`Normalize` as the allowlist). Invalid entries are skipped and logged at
startup, never fatal — a typo must not lock the Operator out, and the seeded
loopback guest still admits the host.

Same pattern as `ClientIp`: static + `Configure` from `EmbeddedApi` before
Kestrel accepts a request, so call sites stay dependency-free.

## D4. Fail closed: proxy peer without a forwarded header

If the socket peer is a trusted proxy and no `X-Forwarded-For` arrived, the
resolved IP is the proxy's own address — 192.168.0.122, which is inside any
sane LAN range. Treating that as LAN would turn every internet visitor into a
LAN visitor the day the proxy's header rule is lost. So such a request is
**not eligible** for the bypass; it falls through to the device cookie, the
hub path, and finally the allowlist rejection exactly as today.

Loopback is a trusted proxy in `ClientIp` (an on-box IIS may sit there), so the
same rule applies to it: a loopback peer without `X-Forwarded-For` is not
eligible either. That is fine — the Operator's own host is admitted by the
seeded `127.0.0.1` guest, as before. Documented in README.

## D5. Spoofing

- A direct LAN peer's `X-Forwarded-For` is ignored (peer is not a trusted proxy),
  so a LAN device cannot claim to be someone else — and does not need to.
- An internet client that sends `X-Forwarded-For: 192.168.0.5` reaches the
  harness as `192.168.0.5, <real>` because ARR appends the true peer; the LAST
  hop wins (unchanged rule), so the resolved IP is the real internet address
  and the bypass does not apply. Covered by a test.

## D6. What the LAN admission does NOT grant

- No trusted-device cookie: `AuthController` mints only when
  `IsApproved(client)` — unchanged, so a LAN login leaves the device without a
  cookie and it must be approved when it appears from the internet.
- No password bypass: `PasswordAuthMiddleware` runs after the gate as before.

## D7. Visibility

- Log line per admission: `[IPFILTER] Admitted {ip} via LAN bypass {cidr}`.
- `GET /api/ipfilter` adds `lanBypass: [cidr…]` and `callerVia: "guest" |
  "lan" | "device" | "none"`.
- Guests page: a one-line note under the approved list when ranges are set
  ("LAN bypass: 192.168.0.0/24 — devices on these ranges skip the guest list;
  the password still applies"). Advanced-mode page already; no capability change.

## D8. Configuration and rollout

- `AppConfig.LanBypassCidrs: string[] = []`. Env override follows .NET array
  binding: `CLAUDEWEB_LANBYPASSCIDRS__0=192.168.0.0/24`.
- Repo `appsettings.json` gets `"LanBypassCidrs": ["192.168.0.0/24"]` next to
  the site-specific `TrustedProxyIps` it already carries. `swap.ps1` preserves
  live's own `appsettings.json`, so the deploy step must add the key there too
  (task 5.2); until then live behaves exactly as today.
- Fleet: both boxes need this build **and** the range in their own config for
  the gate to stop biting in both directions.

## Alternatives rejected

- **Hard-coded RFC 1918 bypass.** Silent and un-auditable; a guest Wi-Fi on the
  same subnet would be admitted with nothing written down. Config keeps the
  decision explicit and per-site.
- **Socket-peer LAN test.** Would classify all proxied internet traffic as LAN
  (peer = .122). Rejected outright; the resolved IP is the only safe input.
- **Minting device cookies on LAN login.** Would turn any LAN device into an
  internet-trusted device with no Operator action. Rejected.
