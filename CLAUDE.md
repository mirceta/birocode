# Claude Web — working notes for Claude

This repo is **Claude Web**, a phone-accessible harness that runs Claude Code
over a repository. It is a C# .NET 8 WinForms app with an embedded Kestrel server
(`ClaudeWeb.App/`) plus a React/Vite frontend (`client/`).

## ⚠️ MOST IMPORTANT CONVENTION — never skip this

**If the user asks for something that violates one of this repo's own
conventions (this file, the docs it points to, or `plans/*.md`), you MUST
explicitly warn them BEFORE doing it.** Name the convention being broken and
where it is written, then let the user decide. Never silently comply, and
never silently refuse — surface the conflict every single time. This applies
to every request, no matter how small.

## Glossary

These terms are used consistently across the docs, plans, and code comments:

| Term | Definition |
|------|------------|
| **Harness** | This app — Claude Web itself, the tool the user is chatting through. Serves on `:5099`. "Our application" always means the Harness. |
| **Repo** | One of the repositories registered in the Harness's repo selector; the working directory Claude reads and edits. |
| **Product** | The application inside the currently opened Repo — whatever Claude builds and starts for the user. Each Repo holds one Product. |
| **Preview Port** | The fixed port (default **5200**) the Product is expected to listen on; the Harness's App tab iframes it. |
| **Self-Development** | The special case where the opened Repo is the Harness's own repo, so Product = Harness. Requires isolated builds (see `docs/claude-web/self-dev.md`). |
| **Operator** | The human at the host PC: sees the monitoring GUI, clicks "Prepare for preview". |
| **End User** | The person on the phone using the web UI served by the Harness. |

## UI modes

The web UI has a device-local **Simple/Advanced** toggle (see
`plans/ui-modes.md`). **New UI features default to Advanced** — add them to the
capability map in `client/src/context/UiModeContext.jsx` as `'advanced'` unless
the user says the End User (Basic mode) needs them.

## Build / run the harness normally

```
npm --prefix client run build      # build the frontend (client/dist)
dotnet run --project ClaudeWeb.App # run the harness (GUI + Kestrel on :5099)
```

## Docs

- `README.md` — setup, build, deploy for human operators
- `ANALYSIS.md` — why this app exists (design rationale)
- `docs/networking.md` — how the homepage / App tab / Local tab are served,
  the gates, and a "won't serve" decision tree — read when ANY surface won't load
- `plans/INTEGRATION.md` — module conventions (how controllers/services plug in)
- `plans/<feature>.md` — one plan per feature, with a status header
- `docs/claude-web/` — preview/proxy guides, managed by the app (see below)

The preview pointer block below and the `docs/claude-web/` guides are managed
by the app's **Prepare for preview** button — re-run it to refresh them.

<!-- claude-web:preview (managed by Claude Web -- re-run "Prepare for preview" to update) -->

## Previewing this app in Claude Web

The Claude Web "App" tab embeds whatever is listening on port **5200**.
Detailed guides live in `docs/claude-web/` (also managed by "Prepare for
preview"). Read the right one for the task at hand:

- **docs/claude-web/preview.md** — read FIRST whenever the user asks you to run,
  start, or preview the app: serve on 0.0.0.0:5200, launch detached, free
  the port.
- **docs/claude-web/proxy.md** — read before building/serving the frontend, and
  when debugging a blank page, 404s on assets, 401s on /api, HTTP 411, or UI
  state that "reverts" seconds after a click: the five reverse-proxy traps
  of the /preview/ sub-path.
- **docs/claude-web/browser-testing.md** — read BEFORE claiming a UI or proxy fix
  works: verify with a headless Playwright browser, not just curl.
- **docs/claude-web/self-dev.md** — read before building or running this repo:
  it is Claude Web itself, so build to an isolated dir, never into the
  running app's own bin/ or port.

<!-- /claude-web:preview -->
