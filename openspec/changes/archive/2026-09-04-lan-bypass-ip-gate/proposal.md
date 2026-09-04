# LAN devices skip the IP allowlist gate; the internet keeps it

## Why

The IP allowlist gate (plans/auth-ip-filter.md, spec `access-control`) admits exact
IPs only. That is right for the internet door, where the Operator wants to know
every address before it can even see the login screen. On the local network it
has become a daily tax with no security payoff:

- Every harness in the fleet (this box, MONSTER at 192.168.0.143, any future peer)
  polls and posts to the others from a LAN address. Each pair of boxes needs both
  IPs approved by hand on both sides; a missed one shows up as a silent `403`
  (2026-09-03: MONSTER answers this box's health probe with `403` — its gate does
  not know .215).
- The Operator's own LAN devices (phone on Wi-Fi, laptop, the console machine)
  need approval one by one, and re-approval when DHCP hands out a new address.

Everything on the LAN still has to present the password; the gate only decides
who gets to *see* the login page. For addresses that are physically on the
Operator's own network that gate adds nothing the password does not already
give, and it breaks the arch agent's fleet traffic.

## What changes

1. **A configured LAN bypass.** `AppConfig.LanBypassCidrs` (appsettings /
   `CLAUDEWEB_LANBYPASSCIDRS__n`) lists CIDR ranges whose resolved client IP
   passes the IP gate without an allowlist entry. Default empty — no range is
   bypassed until the Operator writes one down. Exact IPs are accepted as /32
   (/128).
2. **Resolved IP, never the socket peer.** The LAN test runs on the same
   resolved client IP the allowlist and throttle use (`ClientIp`), so an internet
   visitor arriving through the trusted proxy at 192.168.0.122 is judged by the
   forwarded address, not by the proxy's LAN socket.
3. **Fail closed without a forwarded header.** A request whose socket peer is a
   trusted proxy (a configured proxy or loopback) but which carries no
   `X-Forwarded-For` is never eligible for the LAN bypass, even if the peer
   address is inside a bypass range. A proxy that forgets to forward the client
   address must not silently switch the gate off.
4. **No device cookie from a LAN admission.** The trusted-device cookie is still
   minted only on a login from an Operator-approved IP. A LAN device that later
   appears from the internet goes through the normal approval.
5. **Visible.** Every LAN admission is logged (`[IPFILTER] Admitted <ip> via LAN
   bypass <cidr>`), `GET /api/ipfilter` reports the configured ranges and how the
   caller was admitted, and the Guests page shows the ranges.

## What does NOT change

- The web surface still cannot approve or add anything (the asymmetry rule in
  plans/auth-ip-filter.md §1 stands). Ranges live in config on the host only.
- Loopback keeps its seeded, removable `127.0.0.1` guest. There is still no
  code-level localhost branch; an Operator who wants loopback bypassed lists
  `127.0.0.0/8` like any other range (subject to rule 3).
- The password/session layer is untouched: a LAN visitor still needs the password.
- The ideas-hub token path remains the only path-based exemption.

## Convention change (flagged before starting)

plans/auth-ip-filter.md §2 says "Exact IPs only. No CIDR, no ranges" and the
middleware header says "no exemptions, one flow for everybody". This change
adds a second admission class (configured LAN ranges) next to the device cookie.
The Operator was warned and confirmed on 2026-09-03.

## Impact

- `ClaudeWeb.App/Models/AppConfig.cs`, `appsettings.json`, `README.md`
- `ClaudeWeb.App/Services/Hosting/ClientIp.cs` (origin with proxy/forwarded facts)
- `ClaudeWeb.App/Services/IpFilter/LanBypass.cs` (new), `IpFilterMiddleware.cs`
- `ClaudeWeb.App/Services/Hosting/EmbeddedApi.cs` (configure at startup)
- `ClaudeWeb.App/Controllers/IpFilterController.cs`, `client/src/pages/Guests.jsx`, i18n
- `tests/ClaudeWeb.Tests/LanBypassTests.cs` (new)
- spec `access-control` (MODIFIED: strict gate requirement; ADDED: LAN bypass)
