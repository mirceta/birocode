# Networking map — a durable reference for how surfaces are served

> **Status (2026-06-13):** Done, then refactored for progressive disclosure
> ([doc-principles #2](doc-principles.md)) into a thin overview +
> three detail docs. Diagrams render in the doc-viewer (0 parse errors).
> Not a feature — a doc.

## Why

Networking here spans a lot of moving parts — an off-box IIS proxy, the
harness gates (IP allowlist + password), the `/preview/` hole, the
same-origin `/api/localview/` proxy, LAN-HTTP vs internet-HTTPS, and an
IPv4/IPv6 footgun. When a surface (homepage, App tab, Local tab) shows up
blank, the cause has been spread across memory, several plans, and lived
debugging. We kept re-deriving it. This consolidates the whole picture in
one place so "why won't it serve?" is a lookup, not an investigation.

## What it contains

Thin overview that links down to three cohesive detail docs:

- **[docs/networking.md](../docs/networking.md)** — the 30-second model: cast,
  the two-front-doors topology diagram, the LAN-vs-internet matrix, and
  one-line "how each surface is served" pointers.
- **[networking/surfaces.md](../docs/networking/surfaces.md)** — how the
  homepage / App tab / Local tab each build their iframe URL.
- **[networking/gates.md](../docs/networking/gates.md)** — the gate stack (IP
  allowlist, password on `/api/*`, the `/preview/` hole, XFF/TrustedProxyIps).
- **[networking/troubleshooting.md](../docs/networking/troubleshooting.md)** —
  the payoff: decision tree + symptom→cause→fix + recurring footguns + what
  we control vs the off-box IIS.

## Maintenance

Update it when the topology changes (new gate, new proxied path, a port
move). It references — not duplicates — [proxy.md](../docs/claude-web/proxy.md)
(the five sub-path traps) and [local-app-proxy.md](local-app-proxy.md).
