# Set the Cockpit's inspected repo from the UI

## Why

The Control Room can already inspect any repo, but only via `OPENSPEC_REPO_ROOT`
fixed at launch — to look at a different repo you restart the process. The natural
control is in the UI: a textbox in the Cockpit where you type a repo-root path and
immediately see that repo's OpenSpec state. The env var becomes the *default* the
box is pre-filled with; the box overrides it per request, no restart.

## What changes

- The Cockpit's read endpoints (`/api/cockpit`, `/api/cockpit/show`,
  `/api/cockpit/archived`) accept a `root` parameter; the server runs its OpenSpec
  reads against that repo for that request, falling back to the launch default when
  the param is absent. `/api/cockpit` echoes the resolved `repoRoot`.
- An invalid `root` (not an existing directory) returns a clean error instead of
  silently reading the wrong place.
- The Cockpit tab grows a repo-root textbox (pre-filled with the resolved default);
  typing a path and submitting re-reads against it. Scoped to Cockpit reads — the
  Console's authoring verbs are untouched.
- Still a standalone local app, loopback-only, no new mutating verb, no harness coupling.

## Impact

- Affected spec: `openspec-cockpit` (MODIFIED: the "Configurable inspected repository"
  requirement gains UI-driven, per-request switching).
- Affected code: `openspec-port-app/serve.mjs`, `index.html`, `app.js`, `styles.css`.
