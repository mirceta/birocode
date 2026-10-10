# Design — home bridge

## Shape

```
home PC 192.168.1.105 ──Chrome (setup script)──▶ Hub 192.168.1.101:3128 ──▶ 192.168.0.x:port
                                                   (proxy, home side only)     (as 192.168.0.138)
business 192.168.0.x ──✗──▶ 192.168.1.x   (no listener on B, no forwarding, no route)
```

## Decisions

- **Forward proxy, not routing.** Chrome keeps the real address in the bar, so each harness's
  login cookie and its links to other fleet computers work unchanged. Routing + NAT on a Windows
  client is awkward (connection sharing would renumber the home side) and would expose every
  port of B to every home device that adds a route.
- **Bound to the home-side address, found by subnet.** If the Wi-Fi address changes or drops,
  the listener closes and re-binds to whatever home-side address returns; it never falls back to
  `0.0.0.0`.
- **Two client checks.** A firewall rule admits only the allowed clients to the port; the proxy
  checks the client address again and logs `DENIED client`.
- **Targets are IPv4 literals in the allowed range.** No DNS: a name like
  `192.168.0.42.evil.com` is refused by the proxy, and the setup script sends it direct anyway.
- **Requests.** `CONNECT host:port` is tunnelled (Chrome uses it for WebSockets); absolute-form
  `http://` requests are rewritten to origin-form with `Connection: close` (one request per
  connection, because a pooled proxy connection may next ask another host), then piped both
  ways unbuffered — server-sent events stream live.
- **Standalone program under `tools/`**, WinExe, started at logon by a scheduled task: the
  harness is redeployed often; the bridge must not go down with it.

## Verified (2026-10-10, on the Hub)

- test copy (client = the Hub itself): .42 / .215 health 200, CONNECT tunnel to .166 200,
  192.168.1.1 / example.com / localhost → 403, nothing listening on 192.168.0.138;
- Chromium through the proxy loads both harnesses at their real addresses (789 KB bundle);
- a slow event stream arrives event by event (≈700 ms apart, as sent);
- setup script: 192.168.0.x → proxy; 192.168.1.1, google.com, look-alike names → direct;
- installed copy: listens on 192.168.1.101:3128 only, refuses the Hub itself (`DENIED client`),
  firewall rule TCP 3128 from 192.168.1.105 only, task running, no window.
- Not verifiable from the Hub: a request from 192.168.1.105 itself — the Operator's first use.
