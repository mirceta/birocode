# Serving model clarity — make "global app vs local app" unmistakable and safe

> Editing this plan? First read
> [doc principles](doc-principles.md) — cohesion by unit, progressive
> disclosure, reference-don't-duplicate. The networking facts already live in
> [docs/networking.md](../docs/networking.md) and its sub-docs; this plan
> **references** them, it does not restate them.

> **Status (2026-06-15):** **PROPOSED — not started.** On
> `feature/serving-model-clarity`, branched off main synced with origin/main.
> Scope below is a recommendation (clarity + safety; unification parked); the
> **primary-priority decision is still the user's** (see *Open decision*). No
> code written yet — kickoff only.

## Why this exists (the danger)

The Harness can serve a Repo's **Product** to the user in **two different ways**,
and they have **inverted threat models**. Confusing them is easy and the
consequences are real — hence "dangerous."

| | **"Global app"** | **"Local app"** |
|---|---|---|
| Mechanism | shared **Preview Port :5200**, iframed by the **App tab** *and* the **public homepage** | per-repo **`/api/localview/{repoId}/`** reverse proxy on :5099 |
| Audience | **public / ungated** — `/preview/` is a deliberate, recorded hole | **private** — behind the IP allowlist + password gate (it sits under `/api/`) |
| Port | one fixed global port (`PreviewPort`, default 5200) | per-repo `LocalPort` in `repositories.json` |
| Target | the Product binds `0.0.0.0:5200` | proxy hits `127.0.0.1:{LocalPort}` |
| Product contract | the **five `/preview/` sub-path traps** (`docs/claude-web/proxy.md`) | bind **dual-stack**, **relative URLs** only (`docs/networking/local-product-guide.md`) |

### Concrete danger surface (found in code, this branch's base)

1. **Public/private inversion is invisible.** The App-tab/:5200 product is
   ungated on the homepage (`docs/networking/gates.md`); the Local-tab product is
   gated. Nothing in the UI says which is which, so a **private tool can be put
   on :5200 and exposed to the internet unprotected** — or the operator can
   wrongly assume the homepage is behind the password.
2. **SSRF footgun on the proxy target port.** `POST /api/repos/{id}/localport`
   validates only `1..65535` (`Controllers/RepoController.cs`); there is **no
   blacklist**. The proxy then connects to `127.0.0.1:{LocalPort}`
   (`Controllers/LocalProxyController.cs`). An operator can point a repo at
   `22`/`445`/`3389`/`5099` itself and the Harness will proxy it (still behind
   login, but it is a real internal-port exposure / footgun).
3. **Self-Development collisions.** When Product = Harness, builds fight over
   `:5099`/`:5200` and a locked `bin/`. The rule is documented
   (`docs/claude-web/self-dev.md`) but **nothing enforces it**.
4. **IPv6 bind footgun.** An IPv4-only Local product shows as "offline" because
   the proxy probes `127.0.0.1` while browsers prefer `::1`. Documented, but
   reads as "the proxy is broken."

## Goal

Make it **impossible to confuse** the two serving paths and **hard to do the
dangerous thing**, without (yet) re-architecting them into one. Two outcomes:
- **Clarity:** at a glance — in the app and in one canonical doc — you know which
  path you're on, what's public vs private, which port, and what the Product
  must do to work there.
- **Safety:** the easy mistakes (private→public exposure, SSRF port, self-dev
  collision) are guarded or at least warned, not silent.

## Proposed slices (sequenced safe → visible)

> Build order favors the highest-danger, lowest-risk fix first.

- **Slice 1 — Canonical serving-model doc.** One authoritative page (e.g.
  `docs/serving-model.md`) that names the two paths with the glossary terms
  (Global app = Preview Port; Local app = localview proxy), states the
  public-vs-private threat model side by side, and **links** (not duplicates) to
  the existing how-tos (`preview.md`, `proxy.md`, `local-product-guide.md`,
  `self-dev.md`). Update `docs/networking.md` + `CLAUDE.md` glossary to point at
  it. Docs-only, zero runtime risk.
- **Slice 2 — Safety hardening (the SSRF port).** Add a refused-port guard to
  `POST /api/repos/{id}/localport`: reject/confirm well-known sensitive ports
  (22, 23, 25, 137-139, 445, 3389, …) and the Harness's own `:5099`/`:5200`.
  Surface a clear error in the Local-tab setup form. Backend + small frontend.
- **Slice 3 — In-app clarity.** Make the two surfaces unmistakable: the App tab
  labels its product **"Public — anyone with the link"** (ungated :5200) and the
  Local tab labels itself **"Private — behind your login"** (per-repo proxy),
  each showing the actual port/URL it serves. A one-time confirm before exposing
  anything sensitive on the public path. Frontend-mostly.
- **Slice 4 (optional, later) — Self-Dev collision guard.** A startup/preview
  check that refuses to bind a build over the running Harness's own port and
  points at `self-dev.md`. Smaller, can follow.

## Out of scope (for now)

- **Unifying the two paths into one mechanism.** Tempting (one coherent serving
  model instead of two inverted ones) but a big, risky re-architecture touching
  the public homepage, the off-box IIS forward, and every Product's contract.
  Parked deliberately; revisit only if the user prioritizes it.
- Changing the deliberate **ungated `/preview/`** decision (recorded in
  `docs/networking/gates.md`) — clarify and warn around it, don't silently flip
  it.

## Open decision (needs the user before slice 1 builds)

What must "done right" prioritize / what's the appetite?
**(a)** safety/hardening, **(b)** in-app UX clarity, **(c)** one canonical doc,
**(d)** actually unify the paths. The slices above assume **c → a → b**, with
**d parked**. Reorder/widen on the user's word.

## Key references

- Map of both paths (request flow, gates, config) lives in the code:
  `Controllers/AppController.cs`, `Controllers/HealthController.cs` (Global);
  `Controllers/LocalProxyController.cs`, `Controllers/RepoController.cs`,
  `Models/RepositoryConfig.cs` (Local); `pages/AppRun.jsx`,
  `components/app/productUrl.js`, `pages/Landing.jsx`, `pages/LocalApp.jsx`.
- Existing docs to reference, not restate: [networking map](../docs/networking.md),
  [gates](../docs/networking/gates.md), [preview](../docs/claude-web/preview.md),
  [proxy](../docs/claude-web/proxy.md),
  [local product guide](../docs/networking/local-product-guide.md),
  [self-dev](../docs/claude-web/self-dev.md),
  [local-app-proxy](local-app-proxy.md), [local-app-tab](local-app-tab.md).
