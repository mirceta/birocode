# IP intelligence in the Guests tab

> **Status (2026-06-12):** Planned, on `feature/ip-intel`. Not yet built.

## Problem

The Guests tab ([auth-ip-filter](auth-ip-filter.md)) lists approved guests
and unapproved connection attempts as bare IPs. A bare global IP gives the
Operator nothing to judge by: is that my own phone on mobile data, or a
scanner in a datacenter?

## Design

Each global IP in both lists gains: country (+flag) and city, ISP/org, AS,
reverse-DNS hostname, and a **datacenter/proxy badge** — the strongest
"this is a bot" tell (a residential ISP nearby is probably you; a hosting
rack is a scanner, whatever the country).

Decisions (user approved the API lean):

- **Source**: a free no-key HTTPS geolocation API (ipwho.is) called from the
  backend, plus a local reverse-DNS lookup. Tradeoff accepted: visitor IPs
  are sent to a third-party service. (The no-leak alternative — a local
  MaxMind GeoLite2 DB — was declined as heavy for this app's
  [threat model](threat-model.md).)
- **Datacenter flag is INFERRED, not authoritative**: ipwho.is's free tier
  has no hosting/proxy field (paid). Rather than switch to an HTTP-only API
  (cleartext visitor IPs) we keep HTTPS and infer "non-residential" from the
  org/ASN against a known-provider list (Amazon, Hetzner, OVH, Cloudflare,
  …). A residential ISP is probably the Operator; a hosting rack is a
  scanner. Good enough to triage; not a security guarantee.
- **Never in the request path**: the IP gate must never wait on an external
  API. Enrichment runs lazily when the Guests tab is opened.
- **Cached forever** in `%APPDATA%\ClaudeWeb\ipinfo-cache.json` — an IP's
  geography is stable, so each IP is looked up once; free-tier rate limits
  stop mattering and the tab is instant after first sight. Failed lookups
  are retried on a later load, not stored.
- **Private/LAN addresses** (RFC 1918, loopback) are never sent anywhere —
  labeled "local network" directly.
- **Read-only**: the approve-only-from-desktop asymmetry of
  [auth-ip-filter](auth-ip-filter.md) is untouched; this adds columns, not
  capabilities. The asymmetry warning in `IpFilterController` stands.

## Implementation

1. `Services/IpFilter/IpInfoService.cs` — cache load/save, private-range
   check, ipwho.is HTTP call + rDNS, `EnrichAsync(ips)` fan-out with a
   small concurrency cap.
2. `IpFilterController.Get` — gains `geo` per entry (cache hits only) and
   triggers a background fill for misses; a follow-up tab load shows them.
3. `Guests.jsx` — flag + country/city + ISP line per row, amber
   datacenter/proxy badge; "local network" label for private IPs. i18n
   en/tr.

## Verification

`verify-ip-intel.mjs` on :5201: known public IPs (e.g. 1.1.1.1, 8.8.8.8)
injected as attempts via the allowlist store, enrichment appears on second
load (cache fill proven), private IP labeled locally, cache file written,
no lookup during a gated request. Screenshot read before claiming success.
