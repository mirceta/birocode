# Home bridge: the home computer opens business harnesses through the Hub, one way

## Why

The Operator, 2026-10-10. The Hub (DESKTOP-POAPPP3) is the only computer on both networks:

| Network | Addresses | Trust |
|---|---|---|
| A · home | 192.168.1.x — home PC 192.168.1.105, Hub Wi-Fi 192.168.1.101 | maximal |
| B · business | 192.168.0.x — Hub Ethernet 192.168.0.138, the fleet (.42, .215, …) | must never see A |

From the home PC, Chrome must open `http://192.168.0.42:5099`, `http://192.168.0.215:5099` …
unchanged — harness links are literal registry addresses — while nothing on 192.168.0.x can open
anything on 192.168.1.x. Today the home PC has no way into B (the Hub's IP forwarding is off).

## What changes

A standalone forward proxy on the Hub, `tools/home-bridge` (not part of the harness, so harness
deploys never touch it):

- listens only on the Hub's home-side address (found in `listenSubnet`), never on B;
- serves only `allowClients` (192.168.1.105), checked in code on top of a firewall rule;
- forwards only to IPv4 literals in `allowTargets` (192.168.0.0/24): not an open proxy, no
  internet, no other home machines, no host names;
- IP forwarding stays off, so B gets no route to A;
- serves its own setup script at `/proxy.pac`: business addresses through the bridge, everything
  else direct;
- one log line per request; `install.ps1` turns it on (publish, firewall rule, logon task),
  `uninstall.ps1` turns it off.

Alternatives weighed (routing + NAT, Tailscale, port proxies) are in the Understanding app,
"Your home PC → business network".

## Impact

- New spec: `home-bridge` (ADDED).
- New code: `tools/home-bridge/` only. No harness code, no change to any harness gate.
- Hub machine state: firewall rule "Claude Web home bridge", scheduled task `ClaudeWebHomeBridge`,
  files in `%LOCALAPPDATA%\ClaudeWebHomeBridge`.
- Home PC: Windows proxy "Use setup script" = `http://192.168.1.101:3128/proxy.pac`.
