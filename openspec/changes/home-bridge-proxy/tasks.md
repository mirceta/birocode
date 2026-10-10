## 1. Build

- [x] 1.1 `tools/home-bridge`: forward proxy (home-side bind, client allow-list, target allow-list, CONNECT + absolute-form, `/proxy.pac`, daily log, re-bind on address change).
- [x] 1.2 `install.ps1` (publish, firewall rule, logon task, start, check) and `uninstall.ps1` (off switch).

## 2. Verify

- [x] 2.1 Test copy on :3129: allowed / denied targets, tunnel, no listener on the business side, Chromium loads two harnesses, live event stream, setup-script logic.
- [x] 2.2 Installed copy on :3128: home-side only, refuses non-allowed clients, firewall rule, task running.
- [ ] 2.3 The Operator, on 192.168.1.105: setup script on, `http://192.168.0.42:5099` opens and logs in.

## 3. Ship

- [ ] 3.1 PR; merge on the Operator's word.
