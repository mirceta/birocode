## Context

`discover-local-apps` already returns a typed, validated `{ name, port, folder, evidence }`
list and renders it in each agent dock. The harness separately has a registered-apps
system (Local tab add-app form → `POST /repos/{id}/localapps` → `repositories.json`),
which the original discovery change deliberately left **out of scope** ("No registering of
discovered apps"). That boundary was right for the read-only scan, but it left the operator
copying a name and port by hand from one surface to another. This change adds the missing
bridge — without moving the boundary on discovery itself.

## Decisions

- **Register via the existing endpoint, not a new one.** The Register button calls the
  pre-existing `POST /repos/{id}/localapps` — the same endpoint the Local tab's add-app
  form uses. No new backend code, and the discovery endpoint stays read-only, so the
  "Read-only discovery endpoint" requirement is untouched and still true.
- **"Already registered" is derived, never stored.** `registeredPorts` is computed each
  render from the dock's `localApps` prop (`new Set(localApps.map(a => a.port))`). A row is
  registered iff its port is in that set. After a successful register we call
  `reloadRepos()`, which refreshes repos → the dock's `localApps` → the row flips to
  ✓ Registered on its own. No optimistic local flag to drift out of sync.
  - *Trade-off:* port is the identity key, matching how the dock already keys local apps.
    Two discovered apps on the same port (a misconfiguration) would both read as registered
    once either is added — acceptable, and visible, versus carrying a second key.
- **Per-row failure is inline and local.** A failed `POST` surfaces on that row and leaves
  the rest of the list actionable; it does not abort the discovery result or the other rows.
- **Frontend-only blast radius.** Everything lives in `PinnedAgent.jsx` plus i18n/css.
  The discovery service, prompt, parser, and endpoint are not touched.

## Risks / Trade-offs

- **Port-collision identity** (above): accepted; the alternative key adds complexity for a
  misconfiguration case the operator can already see.
- **Reload cost**: `reloadRepos()` after each register is one extra repos fetch per click —
  negligible, and it is the same refresh the Local tab relies on, so behavior stays uniform.
