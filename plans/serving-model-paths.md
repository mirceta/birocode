# The two serving paths — full map & danger surface

> Detail companion to [serving-model-clarity](serving-model-clarity.md). The plan
> keeps the summary + the map; this file holds the full side-by-side and the
> enumerated danger gaps with their code locations.

## Side by side

| | **Global app** | **Local app** |
|---|---|---|
| Mechanism | shared **Preview Port :5200**, iframed by the App tab *and the public homepage* | per-repo **`/api/localview/{repoId}/`** reverse proxy on :5099 |
| Audience | **public / ungated** — `/preview/` is a deliberate, recorded hole | **private** — behind the IP allowlist + password gate (sits under `/api/`) |
| Port | one fixed global port (`PreviewPort`, default 5200) | per-repo `LocalPort` in `repositories.json` |
| Target | Product binds `0.0.0.0:5200` | proxy hits `127.0.0.1:{LocalPort}` |
| Product contract | the **five `/preview/` sub-path traps** ([proxy.md](../docs/claude-web/proxy.md)) | bind **dual-stack**, **relative URLs** only ([local product guide](../docs/networking/local-product-guide.md)) |

## Danger gaps (found in code at this branch's base)

1. **Public/private inversion is invisible.** The Global path is ungated on the
   homepage ([gates.md](../docs/networking/gates.md)); the Local path is gated.
   Nothing in the UI says which is which, so a **private tool can be put on :5200
   and exposed to the internet unprotected** — or the operator can wrongly assume
   the homepage is behind the password.
2. **SSRF footgun on the proxy target port — GUARDED (serving-model-clarity
   slice 4).** The proxy connects to `127.0.0.1:{LocalPort}`
   (`Controllers/LocalProxyController.cs`), so a port pointed at a sensitive
   loopback service (`22`/`445`/`3389`/a DB) or back at `:5099`/`:5200` turns the
   authenticated proxy into an internal-port SSRF / loop. `POST
   /api/repos/{id}/localport` now runs `Services/Repositories/LocalPortGuard.cs`:
   a guarded port is refused with **HTTP 409 + `requiresConfirm`** (with a
   human reason) and only set when the caller re-sends `confirm: true`. The
   harness/preview ports come from `AppConfig`, not a hardcoded list. Not a hard
   block by design — an operator can still run a dev server on an odd port, but
   must opt in deliberately. (`1..65535` range check still applies.)
3. **Self-Development collisions.** When Product = Harness, builds fight over
   `:5099`/`:5200` and a locked `bin/`. The rule is documented
   ([self-dev.md](../docs/claude-web/self-dev.md)) but **nothing enforces it**.
4. **IPv6 bind footgun.** An IPv4-only Local product shows as "offline" because
   the proxy probes `127.0.0.1` while browsers prefer `::1`. Documented, but
   reads as "the proxy is broken."

## Where the code lives

- **Global:** `Controllers/AppController.cs`, `Controllers/HealthController.cs`;
  frontend `pages/AppRun.jsx`, `components/app/productUrl.js`, `pages/Landing.jsx`.
- **Local:** `Controllers/LocalProxyController.cs`, `Controllers/RepoController.cs`,
  `Models/RepositoryConfig.cs`; frontend `pages/LocalApp.jsx`.
- **Existing docs to reference, not restate:** [networking map](../docs/networking.md),
  [gates](../docs/networking/gates.md), [preview](../docs/claude-web/preview.md),
  [proxy](../docs/claude-web/proxy.md),
  [local product guide](../docs/networking/local-product-guide.md),
  [self-dev](../docs/claude-web/self-dev.md),
  [local-app-proxy](local-app-proxy.md), [local-app-tab](local-app-tab.md).
