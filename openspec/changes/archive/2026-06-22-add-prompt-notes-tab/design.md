# Design

## Context

The ⚙ pop-up is the `PromptManager` modal (portaled to `<body>`), rendered from the
chat composer (`ChatInput.jsx`) behind the `customPrompts` Advanced-mode feature gate.
It already hosts two sibling surfaces that follow an identical pattern end-to-end:

- **Prompts** — `PromptsService` → `/api/prompts` → `PromptsContext`/`PromptsProvider`.
- **Plans** — `PromptPlansService` → `/api/prompt-plans` → `PromptPlansContext` +
  `PromptPlansPanel.jsx`.

Both are **global** (not per-repo) and backend-synced, persisting to
`%APPDATA%\ClaudeWeb\*.json` with atomic temp+rename writes and a
never-reseed-on-unreadable load guard. Notes is a third instance of that same shape,
so the design is "mirror the Plans slice, minus the step/ordering complexity."

## Goals / Non-Goals

**Goals**
- A third **Notes** tab in the same pop-up; create/edit/delete/list freeform notes.
- Global, backend-synced, durable across reload/redeploy — same guarantees as Prompts/Plans.
- Zero regression to the Prompts and Plans tabs.

**Non-Goals**
- **Convert note → plan** (seed a prompt plan from a note). Deferred to a later change.
- Any per-repo scoping, sharing, or sync beyond the existing global JSON store.
- Rich text / attachments — notes are plain freeform text.

## Decisions

- **Separate backend, separate store.** New `PromptNotesService` writing
  `prompt-notes.json`. Deliberately **not** reusing the existing `NotesService`
  (`notes.json`), which backs the Ideas tab — overloading it would entangle two
  unrelated features and risk data collisions. The name `PromptNotes*` keeps the
  ⚙-pop-up family (`Prompt*`) together and distinct from Ideas.
- **Mirror `PromptsService` 1:1** for persistence: a note is
  `{ id, title, body }`; the API fully replaces on edit. Validation caps mirror the
  siblings (title length, body length, max notes), dropping fully-empty notes.
- **Frontend mirrors Plans:** `PromptNotesContext` (fetch-once, add/update/delete) +
  `PromptNotesProvider` wired in `Layout.jsx` next to `PromptPlansProvider`; a
  `PromptNotesPanel.jsx` sibling of `PromptPlansPanel.jsx`; `PromptManager` gains a
  third tab in its existing Prompts | Plans switch.
- **Reuse the `customPrompts` gate** rather than adding a new capability flag — Notes
  lives inside the same pop-up that gate already controls (consistent with how Plans
  rode the same gate).
- **No "Use → composer" action required** for v1 (unlike Plans' step "Use"); notes are
  drafts, not yet send-ready text. (A future change can add note → plan, which is the
  intended bridge.)

## Risks / Trade-offs

- **Naming confusion with Ideas/Notes.** Mitigated by the `PromptNotes` prefix, the
  distinct `prompt-notes.json` store, and an explicit callout in the proposal/spec.
- **Three near-identical service/context stacks** (Prompts, Plans, Notes) is some
  duplication. Accepted: it matches the established repo pattern and keeps each
  surface independently evolvable; a shared abstraction would be premature.

## Migration Plan

Additive only — new endpoint, new store file created on first write. No migration of
existing data; `prompt-notes.json` simply does not exist until the first note is saved
(the load guard treats a missing file as empty).

## Open Questions

- Should a note carry an optional free-text "intended plan name" hint to ease the
  future note → plan conversion? Left out of v1; revisit when that change is proposed.
