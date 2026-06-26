## Context

The OpenSpec Cockpit is a harness-native, repo-scoped tab (frontend
`client/src/pages/Cockpit.jsx`; backend `OpenspecController.cs` +
`OpenspecCockpitService.cs`). It is deliberately read-only: the baseline spec forbids any
mutating verb, and the service only ever runs fixed read verbs
(`openspec list/spec list/validate/show --json`) plus direct disk reads. Repo scoping comes
from `X-Repo-Id` → `RepositoryResolver` → working dir; the service is stateless and takes
the working dir per call (`RunOpenspec(workingDir, args...)` shells `cmd.exe /c openspec`).

The cockpit already computes readiness (`CheckReadiness` → `openspecOnPath`,
`openspecDirPresent`) and renders a "Prepared for OpenSpec?" section, but the not-ready
branch only prints static text ("Run `openspec init`"). The standalone Control Room's
**Operate → Workflows → "Set up the tool"** workflow documents the same port path
(`openspec init --tools claude`, then `openspec update`). This change brings that one action
into the harness cockpit, turning the readiness remediation into a button.

## Goals / Non-Goals

**Goals:**
- One-click port of the *currently selected* repo to OpenSpec from the cockpit
  (`openspec init --tools claude`), so a repo like `prg-copy1` is set up by selecting it —
  no shell, no hardcoded path.
- A secondary "refresh instruction files" action (`openspec update`) for already-initialized
  repos.
- Keep every existing read-only behavior exactly as-is; add the smallest possible write
  surface.
- Re-run readiness after the action and update the cockpit in place.

**Non-Goals:**
- No general command runner — only the two fixed verbs, no arbitrary args.
- No new "port a plans/* feature to OpenSpec" content migration (that stays in
  `docs/openspec-migration.md` and the Control Room); this is just the init/update scaffold.
- No change to the standalone Control Room app; both surfaces coexist.
- No automatic commit of the scaffolded `openspec/` tree — the operator commits as usual.

## Decisions

**1. One new endpoint `POST /api/openspec/setup`, fixed verb chosen server-side.**
The request carries only an action discriminator (`init` | `update`), never a command
string or args. The controller maps `init` → `openspec init --tools claude` and `update` →
`openspec update`, runs it in the resolved repo working dir via the existing
`RunOpenspec`, and returns `{ ok, action, exitCode, stdout, stderr, ready: {…} }`.
*Why over alternatives:* a generic "run openspec" endpoint would re-open the injection
surface the read-only design closed; a discriminator keeps the whitelist to two fixed verbs.

**2. No-clobber guard on init, enforced server-side.**
Before running `init`, the service checks `openspecDirPresent`; if true it returns a
"already initialized" result without running anything. This makes the destructive case
unreachable from the API regardless of what the UI sends. *Why:* `openspec init` against an
existing tree could overwrite scaffolding; the guard belongs at the API, not just the button.

**3. UI: make the existing readiness section actionable; no new tab/section.**
The "Prepared for OpenSpec?" block gains a button whose presence is conditioned on the same
readiness data it already has: show **Set up OpenSpec** when `openspecOnPath && !openspecDirPresent`;
show **Update instruction files** when `openspecDirPresent`; show the install-CLI hint when
`!openspecOnPath` (init can't run without the CLI). After the POST resolves, re-fetch the
cockpit payload (same `load()` path used on mount/repo-switch) so readiness and the rest of
the tab update together.

**4. Reuse `RepositoryResolver` for scoping; reuse `IsSafeName` posture.**
Setup targets the resolved working dir exactly like the read endpoints — the action is
"set up *this* repo", so there is no id/path parameter to sanitize beyond the action
discriminator (validated against the fixed set). This keeps "never target another directory"
true by construction.

## Risks / Trade-offs

- **[First mutating endpoint on a tab specified read-only]** → Spec delta MODIFIES the
  read-only requirement to name this single exception explicitly; the "no mutating verb"
  scenario is rewritten to "no mutating verb *beyond the gated setup action*". The endpoint
  is the only writer and runs only two fixed verbs.
- **[`openspec init` is destructive if mis-aimed]** → Server-side no-clobber guard +
  fixed working dir from the resolver; the UI never supplies a path. init is unreachable when
  `openspec/` already exists.
- **[Long-running CLI blocks the request]** → `init` is fast (scaffold only), but the call
  is synchronous like the existing read calls; if it proves slow we surface a "running…"
  state in the button and rely on the same process plumbing the reads already use. No
  streaming added in this change.
- **[`--tools claude` writes into `.claude/`]** → expected and is the documented behavior of
  the Control Room workflow; the operator reviews/commits the result. Noted, not mitigated.

## Migration Plan

Additive: a new endpoint and an enhanced readiness section. No data migration, no change to
existing read endpoints or payload shape (the `ready` node already exists). Rollback = revert
the change; the cockpit returns to static remediation text. Verified by selecting an
un-ported repo (e.g. `prg-copy1`) in the harness, running the setup action, and confirming
the `openspec/` tree appears and readiness flips to ready.

## Open Questions

- Should a successful init also auto-run `openspec update`, or leave update as a separate
  explicit button? (Leaning separate, per the Control Room's two-step workflow.)
- Should the result surface the created file tree, or just success + refreshed readiness?
  (Leaning the latter for this change; richer output can follow.)
