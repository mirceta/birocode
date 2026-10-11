## 1. Build

- [x] 1.1 `Services/FleetProxy`: settings + validation, service (store, apply, status, setup script), outermost door middleware, browser setting, module registration.
- [x] 1.2 `GET/PUT /api/proxy`; describe carries `proxy`; `GET /api/arch/fleet/topology`.
- [x] 1.3 Settings → Network proxy section; Fleet topology tab (Cytoscape) + pure model; en + tr strings; bundle rebuilt.
- [x] 1.4 Remove the standalone `tools/home-bridge` (uninstalled from the hub).

## 2. Verify

- [x] 2.1 FleetProxyTests (6), fleetTopologyModel tests (6); full suites green.
- [x] 2.2 Lab: door allows / refuses, streams; client role; both UI surfaces driven in Chromium.
- [ ] 2.3 Live: deploy the hub, set "proxy computer"; upgrade the living-room computer, set "proxies through 192.168.1.101:5099"; open http://192.168.0.42:5099 there; Fleet topology shows the via edge with no warning.

## 3. Ship

- [ ] 3.1 Push / PR / merge / deploy / fleet upgrade on the Operator's word.
