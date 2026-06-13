# Networking map — a durable reference for how surfaces are served

> **Status (2026-06-13):** Done. The reference lives at
> [docs/networking.md](../docs/networking.md); diagrams render in the
> doc-viewer (4 diagrams, 0 parse errors). Not a feature — a doc.

## Why

Networking here spans a lot of moving parts — an off-box IIS proxy, the
harness gates (IP allowlist + password), the `/preview/` hole, the
same-origin `/api/localview/` proxy, LAN-HTTP vs internet-HTTPS, and an
IPv4/IPv6 footgun. When a surface (homepage, App tab, Local tab) shows up
blank, the cause has been spread across memory, several plans, and lived
debugging. We kept re-deriving it. This consolidates the whole picture in
one place so "why won't it serve?" is a lookup, not an investigation.

## What it contains

[docs/networking.md](../docs/networking.md):
- **The two front doors** (internet via IIS-HTTPS vs LAN-direct-HTTP) and why
  the door decides protocol/host — and therefore the iframe URLs.
- **How each surface is served** (homepage / App tab / Local tab) with the
  exact URL each iframe targets.
- **The gates** (IP allowlist outermost; password on `/api/*`; the
  deliberate `/preview/` hole) as a flow.
- **LAN vs internet matrix** — what works where.
- **The decision tree + symptom→cause→fix table** — the payoff: walk it
  before blaming React/races/state.
- **What we control vs the off-box IIS we can't.**

## Maintenance

Update it when the topology changes (new gate, new proxied path, a port
move). It references — not duplicates — [proxy.md](../docs/claude-web/proxy.md)
(the five sub-path traps) and [local-app-proxy.md](local-app-proxy.md).
