# Threat model — Claude Web exposure

Status: reference doc, written 2026-06-12 after deploying the auth-ip-filter
feature (see [auth-ip-filter.md](auth-ip-filter.md)).

Context for the ratings: the operator is a single individual, not a
high-value target. Targeted attacks are not economical against this
deployment; what is realistic is **opportunistic, automated internet
scanning**. Likelihood is rated for *this* deployment, not in the abstract.

The root stake behind every Critical rating: an authenticated End User
drives Claude Code with filesystem and shell access on the host PC —
effectively remote code execution by design. The IP gate + shared password
are the only two layers in front of that.

| # | Threat | How it happens | Severity | Likelihood | Notes |
|---|--------|---------------|----------|------------|-------|
| 1 | Password brute-force from an approved CGNAT IP | Stranger sharing the operator's carrier IP finds the site, grinds the password | **Critical** (full RCE via Claude) | **Low** | Needs them to find the domain *and* share the exact CGNAT IP *and* beat throttling. Bad luck, not targeting. |
| 2 | Stale approved IP drifts to a stranger | ISP reassigns an old phone IP; the entry stays approved | Critical (gate bypassed, password still required) | **Low–Medium** | The most realistic decay over time. Prune guests by last-access. |
| 3 | Trusted proxy box (192.168.0.122) compromised | Malware/unpatched IIS on that machine; attacker forges X-Forwarded-For | Critical (gate fully bypassed) | **Low** | The gate's security equals that box's security — inherent to XFF trust (see `AppConfig.TrustedProxyIps` doc comment). |
| 4 | Router port-forward mistake exposes :5099 | 5099 forwarded now or accidentally later → plaintext password to the internet | Critical | **Low** (verify once) | Only 443→proxy should be forwarded on the router. |
| 5 | Password sniffed on LAN (direct :5099, no TLS) | Rogue device/guest on the WiFi captures cleartext HTTP | Critical | **Very Low** | Requires an attacker physically on the home network. |
| 6 | Session cookie theft from an approved device | Malware/XSS on the phone or PC | Critical | **Very Low** | If the device is owned, the cookie is the least of it. |
| 7 | Shared password leaks (reuse, shoulder-surf, paste) | Human factors, not a technical attack | Critical | **Low–Medium** | Single shared secret = single point of failure. The likeliest path in. Don't reuse it anywhere. |
| 8 | DNS hijack / TLS cert theft on the domain | Registrar account or IIS cert compromise | High (MITM of sessions) | **Very Low** | Targeted-attack territory; not economical against this target. |
| 9 | Rejection page as recon oracle | Scanner learns the service exists + an allowlist is in place | **Low** (info only) | **High** | Will happen — scanners hit everything. Deliberate trade-off: visitors must see their IP to ask for approval. |
| 10 | Attempts log flooded (200-entry cap eviction) | Constant scanner knocking washes out interesting entries | **Low** (cosmetic) | **Medium–High** | Noise IPs in the GUI attempts list. Annoyance, not breach. |
| 11 | Router hairpin grouping (if 192.168.0.3 is approved) | NAT loopback rewrites LAN clients' source IPs, so any LAN device using the https URL passes the gate | Medium (gate weakened LAN-wide, password remains) | **Certain** if that option is chosen | Only matters if untrusted people use the WiFi. |
| 12 | ARP spoofing to impersonate the trusted proxy | Attacker on the LAN claims .122's address, forges XFF | Critical | **Very Low** | Subset of "attacker already inside the LAN". |

## Realistic summary

Nobody is coming for this deployment specifically. The threats that will
*actually* occur are #9 and #10 (scanner noise — harmless by design) and,
slowly, #2 (stale approved IPs). Operational habits that matter most:

- Treat the **password** as the real lock: unique, never reused (#7).
- **Prune** approved guests with old last-access dates (#2).
- **Verify once** that the router only forwards 443 to the proxy (#4).

The IP gate shrank "the whole internet can try the password" down to
"approved IPs can try the password" — a screen door in front of the real
lock, not a vault.
