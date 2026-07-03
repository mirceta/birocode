## Why

When the collector registers a remote harness and the pull is rejected, two very different
failures collapse into the same report. On the watched harness they are already distinct on
the wire:

- **IP gate rejection** — `IpFilterMiddleware` (first in the pipeline) answers **403** with a
  JSON body naming the rejected IP. No credential will ever fix this; the remote operator
  must approve the collector host's IP.
- **Missing or wrong credential** — `PasswordAuthMiddleware` answers **401** (or **429** when
  the brute-force throttle has engaged).

But the collector's `IsUnauthorized` treats `401 or 403` identically, so both surface as
status `needs-credential` / "alive — requires a credential" in the events app. An operator
who was actually blocked by the IP gate is told to supply a credential — misleading, and it
sends them down the wrong fix (retyping passwords instead of asking for an IP approval).

## What Changes

- The collector maps the rejection statuses distinctly instead of collapsing them:
  - **403 → `ip-blocked`**: "blocked by the harness's IP gate" — including the collector's
    rejected IP when the 403 body carries it, so the operator can read off exactly which IP
    to ask the remote operator to approve.
  - **401 with no stored credential → `needs-credential`** (today's meaning, now accurate):
    "alive — requires a credential".
  - **401 with a stored credential → `bad-credential`**: "credential rejected" — the operator
    should re-enter it, not wonder whether one is needed.
  - **429 → surfaced as throttled** (detail from the response), not conflated with the above.
- The events-app renders the new statuses distinctly (all remain amber "alive but not
  authorized" states, never dead-red): distinct labels for *IP-blocked*, *needs credential*,
  and *credential rejected*, so the wrong-fix ambiguity is gone at a glance.
- Same distinction on the immediate probe after "Add harness", so the add flow's first
  status already tells the operator which problem they have.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `event-feed-collector`: the failing-source requirement distinguishes *IP-gate blocked*,
  *credential missing*, and *credential rejected* instead of one generic needs-credential
  state.

## Impact

- Backend: `Services/Events/CollectorService.cs` — replace the single `IsUnauthorized`
  (401|403) branch with per-status handling in both the poll and probe paths; extend the
  status taxonomy (`ip-blocked`, `bad-credential`); optionally parse the 403 JSON body's
  `ip` field for the detail line. Credential scrubbing of details is unaffected.
- Frontend: `events-app/index.html` — `dotClass`/label mapping for the two new statuses.
- Compatibility: purely additive status values; the persisted source file is untouched
  (status is runtime-only). A watched harness older than the IP-gate JSON body still yields
  the correct `ip-blocked` from the 403 status code alone — the body is only an enrichment.
- Out of scope: changing what the watched harness returns (403/401/429 are already correct
  and distinct); any write/action toward the watched harness (collector stays read-only).
