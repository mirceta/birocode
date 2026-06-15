# Local app on the agent dock — pin its serving state, then render it

> **Status (2026-06-15):** **Slices 1 & 2 BUILT & browser-verified.** Slice 1
> is **merged to `main`** (`b5c086e`); slice 2 is on `feature/dock-local-app`,
> not yet merged. Each dock shows a local-app row above the git section —
> "serving on :PORT" (live), ":PORT · not serving" (configured but dead), or
> "none". When a port is configured the row is a **toggle**: clicking it swaps
> the dock screen between the chat (default) and the product, iframed via the
> existing `ProductFrame` against `/api/localview/{repoId}/`; the iframe only
> mounts once revealed. Verified on an isolated :5201 preview
> (`.preview-test/dock-local-app-check.mjs` for slice 1;
> `dock-local-app-slice2-check.mjs` for slice 2: serving row is a button with a
> caret, click mounts the product iframe at the localview proxy, click again
> returns to chat, a port-less row stays a non-toggle). Feature complete.

## Problem

The Agent Dashboard's docks (`PinnedAgent`, the "wall of phones") show each
agent's chat plus a git status section ([dashboard-git-status](dashboard-git-status.md)).
They say nothing about the agent's **Local-tab app** — the per-project product
bound to the repo's `localPort` ([local-app-tab](local-app-tab.md),
[local-app-proxy](local-app-proxy.md)). To see whether an agent is actually
serving its product you must open the Local tab for that repo. When watching the
wall of docks you can't tell, at a glance, which agents have a live local app.

## Goal

Make the Repo's local app **renderable inside the dock that hosts the agent**.
As the first step, **pin whether the agent serves a local app**: give each dock
a dedicated space, **above the git section**, stating whether a Local-tab app was
determined to be served in this agent.

## Current state (what's already there)

- Each repo entry carries a nullable `localPort` (repositories.json,
  surfaced on `/api/repos`); the Local tab iframes / proxies it via
  `ProductFrame` and `/api/localview/{repoId}/`
  (`LocalProxyController`, `LocalApp.jsx`).
- `Dashboard.jsx` already passes per-repo data into `<PinnedAgent>`
  (`repoPath` from the `repos` list, `git` from `gitInfo[repoId]`).
- `PinnedAgent.jsx` renders, top to bottom: `phone__bar` header, `phone__lanes`
  toggle, the `phone__git` section, then the `phone__screen` chat. There is no
  local-app row.

So the port data is in hand (`repos.find(r => r.id === tab.repoId).localPort`);
the gap is determining "served" and rendering it.

## Slices

### Slice 1 — pin the serving state above git ✅ (merged, `b5c086e`)

A `phone__localapp` block above `phone__git` in `PinnedAgent.jsx`:

- **Configured + listening** → "Local app · serving on :PORT".
- **Configured, nothing listening** → "Local app · :PORT (offline)".
- **No `localPort`** → a quiet "no local app" (or nothing), matching how the
  git section renders nothing for non-git repos.

Wiring: `Dashboard.jsx` passes `localPort={…}` (and any liveness signal) into
`PinnedAgent`, mirroring `repoPath`/`git`. "Determined to be served" = `localPort`
set AND a liveness probe (reuse `ProductFrame`'s probe / a `/api/localview`
HEAD) succeeds; start with config-derived state and layer the probe in so a
configured-but-dead port reads as offline.

### Slice 2 — render the product in the dock ✅ (built & verified, on the branch)

Iframe/proxy the local product inside the dock, reusing `ProductFrame` against
`/api/localview/{repoId}/`, toggleable with the chat view (like the
builder/ask lane toggle). Off by default so the wall stays light; the slice-1
row becomes the affordance that reveals it.

## Decisions (to confirm)

- **Gating** — advanced-mode dock only, consistent with the Local tab's
  `localAppTab` capability.
- **Liveness in slice 1** — config-only first, then add the probe; or probe from
  the start. Default: config + probe so "determined to be served" is truthful.

## Verification

Browser test (`docs/claude-web/browser-testing.md`): open the dashboard with a
git-backed agent whose repo has a `localPort` serving a marker page; confirm the
dock shows "serving on :PORT" above the git section; stop the marker and confirm
it reads offline; an agent with no `localPort` shows no local-app row and nothing
errors. Hygiene: use a non-self test repo and clear its `localPort` in finally.
