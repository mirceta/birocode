# Design — fleet proxy

## Shape

```
home computer 192.168.1.105                       hub (proxy computer)                         business 192.168.0.x
 Chrome ──setup script (127.0.0.1:5099/proxy.pac)──▶ 192.168.1.101:5099 ── harness middleware ──▶ 192.168.0.42:5099 …
 harness ─HttpClient.DefaultProxy──────────────────▶   (home side only, allowed callers only)    (seen as 192.168.0.138)
business ──✗──▶ home   (the door answers only on the home-side address; no forwarding, no route)
```

## Decisions

- **On the harness port, not a new one.** Kestrel accepts absolute-form request lines
  (`GET http://192.168.0.42:5099/x`), so the door is a middleware on :5099 — the firewall already
  admits it, and a harness redeploy carries it. CONNECT is refused: the harness uses no WebSockets
  and no `https://` inside the house.
- **Outermost, through an IStartupFilter.** The door runs before the IP gate and the password gate
  (it has stricter checks of its own) without editing the shared pipeline (plans/INTEGRATION.md).
- **Three checks, from the socket, never from headers.** Local address in the home subnet; remote
  address in the allow list (TCP peer, not X-Forwarded-For); target an IPv4 literal in the business
  range. Each refusal answers 403 with the reason and lands in the card's recent requests.
- **Streams unbuffered**: response copied chunk by chunk with a flush, before response compression.
  Browsers send `Host` = the target, which Kestrel requires to match the request line.
- **Client role, two halves.** `HttpClient.DefaultProxy` = a proxy that only claims business
  addresses (everything else direct). The browser: the Windows user's `AutoConfigURL`, written only
  when empty, removed only when it is ours, `INTERNET_OPTION_SETTINGS_CHANGED` so Chrome re-reads.
  `CLAUDEWEB_PROXY_NO_BROWSER=1` keeps test instances off the real setting.
- **The role travels in the describe** (`proxy`: role, home subnet, allowed, targets, via, IPv4
  addresses). The hub's `/api/arch/fleet/topology` = its own + each peer's cached describe.
- **Topology model is pure** (`fleetTopologyModel.js`, unit-tested): networks = /prefix of each
  computer's drawn interfaces (the dialled one, plus any shared with another computer or named by a
  proxy — VPN / virtual adapters dropped); a computer on two networks sits between the boxes with an
  interface node inside each; warnings when a client names a non-proxy, or is not allowed, and one
  line for older builds.

## Verified (2026-10-11)

- lab harness (:5200, isolated datadir), proxy role: .42 / .215 through the door 200; home router,
  internet, the business-side address and loopback refused with their reason; normal pages unchanged;
  a slow event stream arrives event by event; setup script correct; client role reaches the proxy,
  browser untouched in the lab.
- UI in the lab: Settings → Network proxy (3 roles, live sentence, ready state, setup script, recent
  requests, reset) and the Fleet topology tab (hub between 192.168.0.x and 192.168.1.x, proxy door,
  the living room allowed, warnings line, details pane, table).
- client 283/283, server 946/946 (6 new FleetProxyTests), fleetTopologyModel 6/6.
- Not yet: the live hub and the living-room computer on this build (deploy + fleet upgrade).
