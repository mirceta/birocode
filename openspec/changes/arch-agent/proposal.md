# Arch Agent — a dedicated project-management chat, separate from harness development

## Why

Today one chat carries two unrelated responsibilities: **building the harness itself**
(self-dev feature work on this repo) and **operating the playground** (managing
projects under the Projects Root, answering questions about them, doing research,
setting up background tasks/loops). Every fleet-level request is funneled through a
repo-bound dev chat, which muddles context (dev conventions, self-dev safety rules,
OpenSpec flow leak into ops conversations and vice versa), and there is no natural
home for cross-project work at all — the July landscape research flagged exactly this
"master agent" gap: every comparable platform (incl. OpenClaw) ships a top-level
delegating agent, while our harness only has per-repo chats.

**Assessment: the split makes sense.** Responsibilities differ on every axis —
working directory (Projects Root vs one repo), conventions (no OpenSpec/plan ritual
for ops questions), risk profile (fleet-wide read + orchestration vs deep write access
to one repo), and conversation lifetime (standing operator dialogue vs feature-scoped
threads). The main risks to design against are (a) scope creep toward rebuilding
OpenClaw — the arch agent should *orchestrate existing harness primitives* (repos,
docks, loops, task graph), not grow its own duplicate stack; and (b) blast radius — a
chat rooted at the playground root can see and touch every project, so its write
powers must be deliberately narrower than a dev chat's.

## What Changes

- A new top-level **Arch Agent** chat surface in the harness, not bound to any single
  registered repo. Its working scope is the **Projects Root** (the playground folder —
  the same root the Projects tab creates projects under).
- Its responsibility is **operating the playground only**: list/inspect/create/organize
  projects, answer questions and do research across projects, and set up background
  work (loops, scheduled tasks) that existing harness primitives then execute.
- **Explicit non-responsibility:** developing harness features. Harness self-dev stays
  in the per-repo dev chat for the harness repo; the arch agent's operating
  instructions steer feature-build requests back there (delegation, not implementation).
- The arch agent gets a distinct identity in the UI (always-available entry point,
  visually distinct from repo docks) and its own persisted conversation(s), reusing the
  existing detached RunSession machinery rather than a new chat stack.
- Per the UI-modes convention, the surface defaults to **Advanced** in the capability map.

## Capabilities

### New Capabilities
- `arch-agent`: the top-level project-management chat — its scope (Projects Root), its
  responsibilities and non-responsibilities, how it is surfaced in the UI, how its
  conversations persist, and the boundaries on what it may write/execute.

### Modified Capabilities
- `chat`: chat sessions are currently keyed to a registered repo; a requirement is
  added for a session whose working scope is the Projects Root (arch context) rather
  than a repo.
- `agent-dock`: the dock/dashboard gains a standing arch-agent entry point that is not
  one of the per-repo tabs (exact surface to be settled in design).

## Impact

- **Backend:** chat module (`RunSessionService` keying, working-directory resolution),
  repos registry (Projects Root already derivable — parent of the self repo), possibly
  a dedicated system-prompt/instructions file for the arch agent's role.
- **Frontend:** dashboard/dock (new standing entry), chat UI reuse, `UiModeContext`
  capability map (`'advanced'`), i18n.
- **Docs/conventions:** CLAUDE.md pointer + a short statement of the dev-vs-ops split;
  Understanding app for the feature per convention.
- **Not affected:** loop engine, task graph, Projects tab — the arch agent consumes
  their existing APIs; no requirement changes there.
