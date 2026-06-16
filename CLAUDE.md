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

## Understanding panel — write your understanding first

When the user gives you a substantive request (a feature, a change, a task —
not a trivial one-liner or a pure question), **first write your understanding
of what they asked for to `understanding.md` at the Repo root**, as markdown:
a short restatement of the goal, the concrete things you'll do, and anything
you're assuming. Keep it current — overwrite it when the request changes.

The Harness renders this file in a collapsible panel at the top of the chat
window (`plans/understanding-panel.md`) so the user can confirm you understood
them before you proceed. This is a prompt convention only — there is no extra
model call. Delete `understanding.md` when the request is done, the same way
`plan.md` is retired when a feature ships.

## Understanding app — build an SPA for what you explain

When you explain something **non-trivial** (a flow, an architecture, how a few
pieces fit together — not a one-line answer), **also visualize it**: author a small
single-page app at **`understanding-app/` at the Repo root**, with
**`understanding-app/index.html`** as the entry point (rolling latest — overwrite
it each time the explanation changes). Keep replying in prose as well; the app is a
companion, not a replacement.

Build it **build-less and self-contained**, the same way `exposure-example/` is: a
folder of static assets — `index.html` plus its JS/CSS, any **vendored** libraries
(no CDN, no `node_modules`), and data files. Use **relative URLs only** (`./app.js`,
not `/app.js`): the Harness serves the folder under the proxy sub-path
`/api/localview/<repo>/app/understanding/`, so a leading slash escapes it and 404s —
the same contract `exposure-example/` teaches. A richer interactive/animated/
multi-view app is the point; reach beyond a static diagram when it aids understanding.

The Harness serves this live in the Local tab's always-on **Understanding** app
(`plans/understanding-spa.md`, `plans/multiple-local-apps.md`), no-store so each
overwrite shows up on reload. There is **no Mermaid (or any) fallback**: if
`understanding-app/index.html` is missing you get an explicit empty state, and a
missing asset is a plain 404 — so a broken app is visibly broken, never masked.

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
