# Proposal: add-agent-audit-trail

## Why

The app now has two agentic features — the dashboard's **Discover local apps** (🛰️) and
**Ask for understanding** (🧠) buttons — that each fire an autonomous agent run against a
repo, yet nothing durable records that they ran. Today an invocation leaves only a
transient trace in the in-memory `RepoEventLog` (cap 500, lost on restart): there is no
answer to "who triggered an agent run, when, against which repo, and how did it end?"
once the harness restarts. As more agentic features are added, this accountability gap
grows with them.

## What Changes

- Record **every invocation of an agentic feature** as a durable audit entry: timestamp,
  feature id (`discover-local-apps`, `ask-for-understanding`, extensible for future
  features), actor (trusted-device / guest / `unknown@<ip>`, resolved the same way the
  action audit does), source IP, repo, and lifecycle outcome (`started` →
  `done` / `error` / `canceled`, with duration and a short error summary).
- Persist entries append-only under the app data dir (JSONL, modeled on the existing
  `AuditService` / `AutopilotAuditLog` patterns), surviving restarts; no web endpoint can
  mutate or clear them.
- Add a read-only **agentic-call audit trail view** in the web UI (Advanced mode, per the
  UI-modes convention) that lists invocations newest-first with filtering by feature,
  repo, and outcome.
- Wire the two existing agentic features' job registries (`LocalAppDiscoveryJobs`,
  `UnderstandingJobs`) to emit audit entries at start and at terminal state, alongside
  their existing `RepoEventLog` emits.

Deliberate scope note: the existing `action-audit` capability keeps its trail
(prompts / tool actions / auth events) **desktop-only**. This change does not touch that
trail. The new agentic-call trail is a separate, strictly narrower dataset — invocation
metadata only, never prompt text or tool arguments — which is why exposing it in the web
UI does not weaken the action-audit stance.

## Capabilities

### New Capabilities

- `agentic-call-audit`: durable, append-only recording of every agentic feature
  invocation (who, when, where-from, which repo, which feature, outcome), plus the
  read-only web UI trail that displays and filters those records.

### Modified Capabilities

<!-- none — discover-local-apps and ask-for-understanding keep their requirements
     unchanged; the recording obligation lives entirely in agentic-call-audit,
     which names them as the currently registered agentic features. -->

## Impact

- **Backend (new)**: `ClaudeWeb.App/Services/AgenticAudit/` — a small append-only store
  (JSONL under `AppPaths.DataDir`) + DI module; a read-only controller endpoint for the
  trail (list + filters).
- **Backend (touched)**: `Services/StructuredAsk/LocalAppDiscoveryJobs.cs` and
  `Services/Understanding/UnderstandingJobs.cs` (emit audit entries at start/terminal);
  their controllers (`LocalAppsController`, `UnderstandingController`) pass the resolved
  actor in (reusing `AuditService.ResolveActor`).
- **Frontend (new)**: an audit-trail view component; capability-map entry in
  `client/src/context/UiModeContext.jsx` as `'advanced'`; i18n strings in
  `client/src/i18n/en.json` / `tr.json`.
- **No breaking changes**; existing `action-audit` store and desktop Activity tab are
  untouched.
