## 1. Server

- [x] 1.1 `AppConfig.LanBypassCidrs` (string[], default empty) with doc comment;
      `appsettings.json` gets `"LanBypassCidrs": ["192.168.0.0/24"]`.
- [x] 1.2 `ClientIp.GetOrigin` → `ClientOrigin(Ip, PeerIsTrustedProxy, Forwarded)`;
      `Get` delegates to it.
- [x] 1.3 `Services/IpFilter/LanBypass.cs`: `Configure`, `Cidrs`, `Match(origin)`,
      `MatchIp(ip)`; IPv4 + IPv6 CIDR, bare address = host range, invalid entries
      logged and skipped; fail-closed rule for proxy-peer-without-forwarded.
- [x] 1.4 `IpFilterMiddleware`: LAN branch between allowlist and device cookie,
      `[IPFILTER] Admitted … via LAN bypass …` log, header comment updated.
- [x] 1.5 `EmbeddedApi`: `LanBypass.Configure(_config)` beside `ClientIp.Configure`;
      pipeline comment updated.
- [x] 1.6 `IpFilterController` GET adds `lanBypass` + `callerVia`.

## 2. Client

- [x] 2.1 Guests page shows the configured ranges (en + tr strings).

## 3. Tests

- [x] 3.1 `LanBypassTests.cs`: CIDR parsing (v4, v6, bare, invalid skipped);
      direct LAN peer admitted; direct LAN peer with spoofed XFF judged by socket;
      trusted proxy + forwarded internet IP rejected; trusted proxy + spoofed LAN
      first hop + real last hop rejected; trusted proxy without XFF NOT eligible
      (fail closed) even though .122 is in range; loopback without XFF not eligible;
      empty config never matches.
- [x] 3.2 `dotnet test` green. 204/204 (2026-09-03).

## 4. Verification (isolated instance, real HTTP)

- [x] 4.1 Boot an isolated ClaudeWeb.exe (`CLAUDEWEB_DATADIR` temp, no seeded
      guests, `CLAUDEWEB_LANBYPASSCIDRS__0=127.0.0.0/8`): plain loopback request
      → 403 (loopback is a trusted-proxy peer without XFF: fail closed);
      loopback + `X-Forwarded-For: 127.0.0.1` → 200 shell (LAN via forwarded);
      loopback + `X-Forwarded-For: 203.0.113.9` → 403 (forwarded internet IP);
      `/api/ipfilter` (with password) reports the range. Without the env var
      every one of those is 403 (default unchanged).
      DONE 2026-09-03 via `.claudeweb-preview/lan-bypass-e2e.ps1` (build `.selfdev-build/lan-check`):
      plain loopback 403 · loopback+XFF 127.0.0.1 → 200 shell, log "Admitted 127.0.0.1 via LAN
      bypass 127.0.0.0/8" · XFF 203.0.113.9 → 403 · "127.0.0.1, 203.0.113.9" → 403 ·
      /api/ipfilter via LAN: 401 without password, 200 with (callerVia "lan", lanBypass
      ["127.0.0.0/8"]) · with 192.168.0.0/24 instead every loopback probe is 403.
- [x] 4.2 Understanding app updated (gate decision flow, before/after).

## 5. Ship

- [x] 5.1 Docs: README config section; docs/networking.md gate note.
- [ ] 5.2 Deploy: add `"LanBypassCidrs": ["192.168.0.0/24"]` to live's preserved
      `.selfdev-build/run-bin/appsettings.json` before/with the swap; confirm a LAN
      device is admitted in the live log and an internet visitor via .122 still
      hits the gate.
- [ ] 5.3 MONSTER: same build + range, then the fleet health probe from .215 answers 200.
