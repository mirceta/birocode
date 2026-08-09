## Why

Loop runs (queued prompts, goal-based loops) are only as good as the task lists
fed into them, but today those task lists are drafted ad hoc — in chat scrollback,
scratch files, or an agent's head — with no shared place where the Operator and
multiple agents can build them up before committing them to a real loop. "Fill the
loop" gives every registered repo a persistent drafting surface in the Autopilot
console, plus a homepage-exposed prompt so any agent on this box can be pointed at
it and asked to write or refine the draft.

## What Changes

- The Autopilot console gains a **📝 Drafts root tab** (sixth root entry, alongside
  Overview / Suggestion-based loop / Goal-based loop / Audit / Reference), with a
  per-repo subtab row driven by the harness's registered-repo store.
- Each repo holds **exactly one draft per draft type**, of three types:
  **queue-plan** (a delimiter-separated sequence of self-contained prompts destined
  for the queued-prompts loop), **goal** (a single coherent goal definition), and
  **freestyle** (unstructured text not yet ready to be split into either). v1 keeps
  every type a plain big textarea with explicit Save + Reload, a per-type
  last-edited stamp, and non-empty badges on the type switcher; a structured
  queue-plan editor and a "push to queue" action are explicitly deferred.
- New backend **drafts store + HTTP API**: `GET/PUT /api/autopilot/drafts/<repo>/<type>`
  plus a list endpoint reporting which (repo, type) drafts have content and when
  they were last edited. Repo names validate against the registered-repo store.
  Agents edit drafts **via this API only** — no file-on-disk contract.
- New **agent-agnostic convention doc** `docs/loop-drafts-convention.md` — the
  on-disk single source of truth for the contract: what content shape each type
  expects and the exact HTTP calls to read/write a (repo, type) draft.
- The **homepage app on :5305** gains a **"Fill the loop" topic**
  (`homepage/assets/loopdrafts-topic.js`, registered in `index.html`) exposing a
  copy-pastable prompt, parameterized by repo and draft type, that points a pasted
  agent at the convention doc's API contract.
- The Drafts tab registers as **`advanced`** in the UI-mode capability map.

## Capabilities

### New Capabilities

- `loop-drafts`: per-repo, per-type loop draft storage — the three draft types and
  their content contracts, the HTTP API agents and the UI share, the Drafts tab's
  editing surface (textarea, Save/Reload, stamps, badges), the agent-agnostic
  convention doc, and the homepage "Fill the loop" prompt exposure.

### Modified Capabilities

- `autopilot-console`: the root tab row gains a 📝 Drafts entry — a grouped root
  whose second level is the per-repo subtab row (each repo opening its three-type
  draft editor). Like the briefing editor (loop-agent-briefing D2b) and the
  Research subtab, Drafts is **not fenced by the operator gate**: drafting is pure
  idea capture with no send path, so it stays usable whenever the console is
  visible. The delta also re-states the root row against the code's current shape
  (Tests already sits at root level), correcting baseline drift.

## Impact

- **Backend**: `ClaudeWeb.App/Controllers/AutopilotController.cs` (new endpoints,
  modeled on the existing `briefing` GET/PUT pair) or a dedicated controller; a new
  persisted store file alongside the existing autopilot data; repo validation
  against the registered-repo store.
- **Frontend**: `client/src/components/autopilot/AutopilotConsole.jsx` (new root
  tab + per-repo `SubTabs` row + draft editor view), `client/src/pages/autopilot.css`,
  `client/src/context/UiModeContext.jsx` (capability map entry), i18n strings.
- **Homepage**: new `homepage/assets/loopdrafts-topic.js`, `homepage/index.html`
  script registration.
- **Docs**: new `docs/loop-drafts-convention.md`.
- **No breaking changes**; existing loops, queues, and the briefing endpoint are
  untouched.
