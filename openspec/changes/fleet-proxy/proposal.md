# Fleet proxy: a proxy computer and the computers that go through it — harness settings, plus a Fleet topology tab

## Why

The Operator, 2026-10-10/11. The hub (DESKTOP-POAPPP3) is the only computer on two networks:

| Network | Addresses | Trust |
|---|---|---|
| home | 192.168.1.x — the home computer 192.168.1.105 (living room), hub Wi-Fi 192.168.1.101 | maximal |
| business | 192.168.0.x — hub Ethernet 192.168.0.138, the fleet (.42, .215, …) | must never see home |

From the home computer, Chrome must open `http://192.168.0.42:5099` … unchanged (harness links are
literal registry addresses), while nothing on the business network can reach home. A first cut
was a standalone Windows proxy + scheduled task + firewall rule; the Operator rejected it: it must
be **the harness**, configured by **obvious settings** — "this computer is a proxy computer" on the
hub, "this computer proxies through the proxy computer" on the living-room computer.

And the fleet's network shape is no longer "a hub and its peers": the arch needs a **Fleet
topology** view that draws the networks, who lives where and any proxy, from the settings.

## What changes

- **Settings → Network proxy** (Management App, top of the Settings tab): three roles —
  *not part of a proxy setup* / *this computer is a proxy computer* (home side, allowed computers,
  business range) / *this computer proxies through a proxy computer* (its address, business range,
  "also this computer's browser"). A live sentence says what the choice does; the card shows this
  computer's addresses, whether it is ready / reaches the proxy computer, the browser state and the
  proxy's recent requests. Saved per harness (`<datadir>/fleet-proxy.json`, `GET/PUT /api/proxy`).
- **The proxy door is the harness itself** — an outermost middleware on the harness port: it forwards
  a browser's proxy request only when this harness is a proxy computer, the request arrived on its
  home-side address, the caller is an allowed computer and the target is an IPv4 address in the
  business range. No new port, no firewall change, no IP forwarding. `/proxy.pac` serves the setup
  script for either role.
- **The client side**: this harness's own calls to the business range go through the proxy computer,
  and (opt-out) this Windows user's "Use setup script" points at this harness's `/proxy.pac`, so
  Chrome opens business addresses as they are. Only the harness's own value is ever written or removed.
- **The describe carries the role and the addresses**, so the hub knows every computer's place.
- **Management App → Fleet topology tab**: a Cytoscape graph, from the arch's perspective, of the
  networks (one box each), the computers in them (the hub between the boxes when it is on two),
  the arch's link to each computer (green answers / red not), the proxy computer's one-way door and
  who goes through it, plus warnings when settings disagree, and a table.

## Impact

- New capability spec `fleet-proxy`; `management-dashboard` gains the Fleet topology tab.
- New code: `Services/FleetProxy/*`, `FleetProxyController`, `ProxySettings.jsx`, `FleetTopology.jsx`,
  `fleetTopologyModel.js`; describe + `/api/arch/fleet/topology` in the arch service.
- Replaces the standalone `tools/home-bridge` of the first cut (uninstalled from the hub: task, rule, files).
- Needs every fleet harness on this build to report its role (older builds show "unknown").
