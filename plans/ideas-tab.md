# Ideas tab — per-project notes, stored on the backend

> **Status (2026-06-13):** Deployed and confirmed ("It works", 11:25;
> rollback disarmed; health 200, bundle hash match, live /api/notes
> POST/GET/DELETE round-trip OK, notes.json written). Browser-verified on
> :5201 — `verify-ideas-tab.mjs` 11/11 (create, edit, delete, reload
> persistence, PROJECT SCOPING both directions, basic-mode hidden;
> screenshot read). On `feature/ideas-tab`, not yet merged to main.
> Decisions locked: create + edit + delete, **plain text**; **Advanced
> mode only**; **body-only** notes (first line = heading); **separate**
> from prompt-stash. Markdown deferrable.

## Problem

The user wants a place to jot and keep ideas/notes that belong to a
**project** (not to a chat or an agent run) — write a note on the tab, it
persists on the backend, and each project shows only its own notes.

## Relationship to prompt-stash (convention check)

`plans/prompt-stash.md` already stores short notes — but they are
**per-agent-tab and ephemeral**: a stash item lives on a dock tab, rides
dock sync, and is discarded when the agent is closed. The Ideas tab is a
different thing: **per-project and persistent**, with its own nav tab, not
tied to any run. They coexist; this plan does not touch prompt-stash. (Open
question Q4 asks whether you'd ever want a stash item promotable into an
idea — out of scope unless you say so.)

## Design

A new **Ideas tab** (advanced-only). The tab shows the current project's
notes (newest first) and a composer to add one. Scoped to the selected
project the same way Files/Git/Plan are: by the `X-Repo-Id` header, so
switching projects re-fetches that project's notes — no note ever leaks
across projects.

### Backend

- `Services/Notes/NotesService.cs` — notes keyed by repo id, persisted to
  `%APPDATA%\ClaudeWeb\notes.json` with the **atomic temp+rename** write and
  the never-reseed-on-unreadable load guard (the `UiSettingsService`
  pattern, born from the 2026-06-12 registry-clobber). A note is
  `{ id, text, createdAt, updatedAt }`; text capped server-side (proposed
  20 000 chars — bigger than stash's 4 000 since these are notes, not
  prompts).
- `Controllers/NotesController.cs`, route `api/notes`, repo scope from the
  `X-Repo-Id` header (`RepositoryResolver`, same as the other per-project
  controllers — never a path/body):
  - `GET    /api/notes` → this project's notes, newest first
  - `POST   /api/notes` `{ text }` → create, returns the note
  - `DELETE /api/notes/{id}` → remove one
  - `PATCH  /api/notes/{id}` `{ text }` → edit (only if Q1 = yes)
- DI via `AddNotesModule()` registered next to `UiSettingsService` in
  `EmbeddedApi.cs`.

### Frontend

- `pages/Ideas.jsx` + `ideas.css` — composer (textarea + Add) above a list
  of note cards (text, relative time, ×-delete; inline edit if Q1=yes).
  Page-local state that fetches on mount and whenever `currentRepoId`
  changes (the Files/Git pattern) — no global context needed, notes are
  only used on this tab. Optimistic add/delete with rollback on failure.
- Registry/route/capability/i18n: `tabRegistry.jsx` entry (key `ideas`,
  icon 💡), `App.jsx` route `/studio/ideas`, `SettingsController.KnownTabs`
  += `ideas`, `ideasTab: 'advanced'` in the capability map, en/tr strings.

### Decisions (my calls — flag if you disagree)

- **Per selected project, not per agent tab.** "Each project separately"
  means the global project selection (`currentRepoId`), like every other
  nav tab — not the dual-chat/agent repo override.
- **Backend-synced** (no localStorage): phone and desktop are used
  interchangeably — your standing preference.
- **Advanced-mode default** per the new-feature convention; trivially
  promotable to Basic if the End User should have it.
- **Plain text, not markdown** to start (Q2). One store file keyed by repo
  id, not a file-per-project — matches `uisettings.json`/`repositories.json`.

## Resolved (was: open questions)

1. Edit: **yes** — `PATCH` + inline editor.
2. Body format: **plain text** to start; markdown is a clean later add.
3. Per note: **body-only**, first line acts as the heading.
4. prompt-stash: **kept fully separate**, no promote path.

## Verification (planned)

`verify-ideas-tab.mjs` on :5201: add a note → backend round-trip → reload
persistence; notes are **project-scoped** (a note on repo A is absent after
switching to repo B, present again on return); delete removes it; (edit
updates it if Q1=yes); tab hidden in Basic mode. Hygiene: `notes.json` is
shared with live — the test writes under a pinned test repo id and clears
its notes in `finally`; session logged out.
