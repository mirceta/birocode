## Why

Discovery findings do not only come from the harness's own scan: the operator
sometimes prompts another agent to look for more local apps, and that agent
returns a JSON array of findings. Today there is no way to get those findings
into the per-repo discovery cache — the only writer is the harness's own scan —
so externally discovered apps can't be registered, run, or checked from the
Discover Apps panel.

## What Changes

- The Discover Apps panel gains an **Import** action: the operator pastes a JSON
  array of findings (or picks a `.json` file, which fills the same input) and
  submits it.
- A new harness endpoint accepts the JSON array for the caller's repository,
  validates it, and merges it into the on-disk cache with the **same
  union-by-port semantics as a scan**: new ports added, matching ports replaced
  by the imported finding, unmatched cached ports kept. Each imported finding is
  stamped with the import time as its `discoveredAt`.
- Invalid input (malformed JSON, not an array, findings missing a usable port)
  is rejected with a clear error and leaves the cache **unchanged** — no partial
  imports.
- After a successful import the merged set becomes what status reads, cache
  loads, and Run-by-port see — identical to a scan finishing.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `discover-local-apps`: a new requirement — import externally produced findings
  into the per-repo cache via the panel, reusing the union-by-port merge; the
  import is validated all-or-nothing and never touches the repository's files.

## Impact

- `ClaudeWeb.App/Controllers/LocalAppsController.cs` — new import endpoint.
- `ClaudeWeb.App/StructuredAsk/LocalAppDiscoveryCache.cs` — reuse/expose the
  union merge for an imported report.
- `ClaudeWeb.App/StructuredAsk/LocalAppDiscoveryJobs.cs` — in-memory job result
  updated to the merged set so polls reflect the import.
- `client/src/components/dashboard/DiscoverAppsPanel.jsx`,
  `client/src/components/dashboard/useLocalAppDiscovery.js` — import UI + action.
- `client/src/i18n/en.json`, `client/src/i18n/tr.json`, `dashboard.css` — strings
  and styles; stays under the existing `localAppDiscovery` Advanced capability.
- `tests/ClaudeWeb.Tests` — merge + endpoint validation tests.
