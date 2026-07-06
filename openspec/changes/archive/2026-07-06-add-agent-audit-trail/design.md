# Design: add-agent-audit-trail

## Context

Two agentic features exist today, both dashboard buttons on an agent card
(`client/src/components/dashboard/PinnedAgent.jsx`), both backed by the same
backend-owned-job pattern:

- **Discover local apps** → `LocalAppsController` → `LocalAppDiscoveryJobs.StartOrJoin`
  (read-only structured ask via `StructuredAskRunner` / ClaudeMonitor gateway).
- **Ask for understanding** → `UnderstandingController` → `UnderstandingJobs.StartOrJoin`
  (forks the builder session via snapshot-resume, writes `understanding-app/`).

Each job is an in-memory, latest-only record per repo; the only trace of a run is the
in-memory `RepoEventLog` (cap 500, gone on restart). The app already has two durable
audit patterns to draw on:

- `Services/Audit/AuditService.cs` — the **action audit** (prompts/tools/auth): daily
  JSONL under `%APPDATA%\ClaudeWeb\audit\`, desktop-only by spec, plus `ResolveActor()`
  (trusted device → guest → `unknown@<ip>`).
- `Services/Autopilot/AutopilotAuditLog.cs` — single append-only JSONL
  (`autopilot-audit.jsonl`) with `Record()` / `Recent(max)` under a lock.

## Goals / Non-Goals

**Goals:**
- Durable, append-only record of every agentic feature run: when, which feature, which
  repo, who (actor + IP), and how it ended (done / error / canceled, duration, error
  summary).
- A read-only web UI trail (Advanced mode) with filters; in-flight runs visible.
- An emit surface generic enough that the next agentic feature registers with one call.

**Non-Goals:**
- Not touching the `action-audit` capability, its store, or its desktop-only stance.
- Not capturing prompt text, tool calls, or agent output — invocation metadata only
  (that is what makes a web-visible trail compatible with the action-audit stance).
- Not auditing chat lanes or Autopilot (they have their own records).
- No retention/rotation in v1 (volume is human-button-press scale; see Risks).

## Decisions

1. **New `AgenticAuditLog` service modeled on `AutopilotAuditLog`, not an extension of
   `AuditService`.** The action-audit spec forbids web read-back of its store; mixing
   the two datasets in one store would make the web endpoint a spec violation waiting
   to happen. A separate single-file JSONL (`AppPaths.DataDir/agentic-audit.jsonl`,
   thread-safe append, `Recent(max)` read) keeps the boundary physical. We still reuse
   `AuditService.ResolveActor()` for identity so attribution is identical across both
   audits.

2. **Two entries per call, correlated by `callId`.** Append-only stores can't update.
   Writing only a terminal entry would lose runs that die with the process, so:
   `started` entry at actual job start, terminal entry (`done`/`error`/`canceled` +
   duration + trimmed error) when the job ends. The read side merges by `callId`; a
   `started` with no terminal renders as *running* (or *interrupted* if the process
   restarted — detectable because the job registry is empty after restart).

3. **Record actual starts only; joins are not new calls.** `StartOrJoin` lets a second
   client attach to an in-flight job. That is a view of the same agent run, not a new
   invocation, so it does not append an entry. (Alternative — a `joined` kind — adds
   noise without accountability value; rejected.)

4. **Emit from the job registries, not the controllers.** `LocalAppDiscoveryJobs` /
   `UnderstandingJobs` own the lifecycle (they know real start vs join, and terminal
   state fires inside their fire-and-forget task even if the client disconnected).
   Controllers resolve the actor (`AuditService.ResolveActor(HttpContext)`) and pass it
   into `StartOrJoin` — identity is request-scoped, lifecycle is job-scoped.

5. **Read endpoint `GET /api/agentic-audit`** (query: `feature`, `repo`, `outcome`,
   `limit`) returning merged calls newest-first. Read-only; no mutating verbs exist on
   the controller at all. Sits behind the normal auth gates like every other API.

6. **Frontend: an "Agent audit" panel on the dashboard**, gated as `'advanced'` via a
   new `agenticAudit` capability in `client/src/context/UiModeContext.jsx` (per the
   UI-modes convention: new features default to Advanced). Table newest-first with
   feature / repo / outcome filters; polls while any call is running (same 5s cadence
   the dock buttons already use).

## Risks / Trade-offs

- [Single-file JSONL grows forever] → Volume is manual button presses (tens/day at
  worst). `Recent(max)` caps read cost. If it ever matters, switch to the daily-rotation
  pattern `AuditService` already demonstrates — a store-internal change, spec unchanged.
- [Orphaned `started` entries after a crash/restart] → Merge logic treats
  started-without-terminal as *interrupted* when the job registry has no live job for
  that `callId`; never renders a phantom "running" forever.
- [Two stores could drift in identity semantics] → Both use `AuditService.ResolveActor`;
  actor resolution stays single-sourced.
- [Future agentic features forget to emit] → The emit API is one call at start + one at
  terminal; document in the new capability spec that registering a feature means wiring
  these two calls. (A hard central choke point doesn't exist — jobs are deliberately
  decoupled registries.)

## Migration Plan

Additive only: new service + DI module, new controller, two touched job registries, new
frontend panel. No data migration, no config required (defaults on). Rollback = revert;
the JSONL file is inert if unread.

## Open Questions

- None blocking. Placement of the panel (own dashboard tab vs section under the
  existing Activity area) can be settled at implementation; the spec only requires a
  read-only Advanced-gated trail view.
