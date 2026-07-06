# hard-mix — golden fixture for the discovery eval

A deliberately hard "repository" for evaluating `discover-local-apps`. The
ground truth is `expected.json` (identity = **folder + port**). Everything else
in here is either a true app or a decoy; keep this README and `expected.json`
in lockstep with the contents.

## True apps (4) — must ALL be found (recall)

| Folder | Port | Style | Why it's easy to miss |
|---|---|---|---|
| `homepage-widgets` | 5411 | Node `serve.mjs` (ESM) | the "canonical" shape — the freebie |
| `tools/status-board` | 5412 | Node `server.js` (CommonJS) | nested two levels; port held in `STATUS_PORT` const |
| `ops/panel` | 5413 | PowerShell `serve.ps1` (HttpListener) | not a Node file at all; port in a PS variable |
| `svc/miniview` | 5414 | Embedded C# `HttpListener` console app | no `serve.*` filename; port inline in `Program.cs`; start = `dotnet run` |

All four bind dual-stack loopback (`::` dualstack, or explicit `127.0.0.1` +
`[::1]` prefixes), serve a page at `GET /`, and use relative asset URLs — valid
exposures per `docs/local-exposure-convention.md`.

## Decoys (5) — must NOT be reported (precision)

| Folder / file | Looks like | Why it is NOT an exposure |
|---|---|---|
| `dev-tools/mock-client` | talks HTTP, mentions ports | it's a *client* (`http.get`), never listens |
| `landing-src` | static site with index.html + assets | nothing serves it; no server file, no port |
| `gateway-proxy` | real `createServer` + `listen` | `listen(0)` — ephemeral port, not FIXED |
| `legacy/v4only` | fixed port 5499, serves at root | binds `127.0.0.1` only — violates the dual-stack rule |
| `docs/api-notes.md` | `app.listen(3000)`, `HttpListener` in text | code inside markdown docs; nothing runnable |

## Auditing the ground truth

Each `expected.json` entry's `note` names the file and binding that prove it.
If you add/remove an app or decoy, update `expected.json` AND the tables above
in the same commit.
