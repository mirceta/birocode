# Ideas — fuzzy filter + optional project field

> **Status (2026-06-15):** **Built, browser-verified & merged to main**
> (not yet deployed to :5099). On `feature/ideas-filter-project`, branched off
> `main` (which already has the global Ideas work — `IdeasPanel`, `/api/notes`,
> the `Note` record). Adds a client-side fuzzy filter over the ideas list and an
> optional free-text `project` field on each idea. Verified on an isolated
> :5210 instance (`.preview-test/ideas-filter-project-check.mjs`, ALL PASS:
> chip renders, fuzzy subsequence match, filter matches the project field,
> no-match state, clear-restores-all, project survives reload). Builds on
> [ideas-pinned-dashboard](ideas-pinned-dashboard.md) and
> [ideas-tab](ideas-tab.md).

## Problem

The Global Ideas list (`components/ideas/IdeasPanel.jsx`, shared by the Ideas
tab and the dashboard's pinned-left panel) is a flat, ever-growing list with
**no way to narrow it** and **no notion of which project an idea belongs to**.
As the master list grows this gets hard to scan, and ideas that really concern
a particular product can't say so.

## Design

Two independent additions, both flowing through the one shared `IdeasPanel`
component so the Ideas tab and the dashboard panel get them together.

### 1. Optional project field (persisted)

- **Backend** (`Services/Notes/NotesService.cs`, `Controllers/NotesController.cs`):
  add an optional `Project` to the `Note` record
  (`Note(Id, Text, Project, CreatedAt, UpdatedAt)` — `Project` nullable/empty
  by default). Accept it on `POST /api/notes` and `PATCH /api/notes/{id}`.
  Persist in `notes.json`. **No breaking migration:** old notes simply load
  with an empty project (System.Text.Json tolerates the missing field).
- **Frontend** (`IdeasPanel.jsx`): a small text input in the add/edit composer
  for the project; show the project (e.g. a chip/label) on each idea card when
  set.

### 2. Fuzzy filter (view-only)

- A filter text input at the top of `IdeasPanel`. As the user types, fuzzy-match
  (typo-tolerant subsequence, client-side) against each idea's **text** and
  **project**, rendering only matches. Empty filter = show all.
- Purely view state — not persisted, not sent to the backend. Operates over the
  already-loaded global list.

## Slices

- **Slice 1 — project field** — backend `Project` field end-to-end + composer
  input + card display. Frontend + backend.
- **Slice 2 — fuzzy filter** — the filter input + client-side fuzzy match over
  text + project. Frontend-only.

(Order is flexible; the two are independent. Filter can ship first if simpler.)

## Verification

- Backend: add an idea with a project, reload, confirm it persists in
  `notes.json`; edit the project; confirm an old projectless note still loads.
- Frontend: browser-verify (per `docs/claude-web/browser-testing.md`) on an
  isolated :5200 instance — project shows on the card, filter narrows the list
  live (including a fuzzy/typo case), empty filter restores all. Check both the
  Ideas tab and the dashboard pinned-left panel since they share the component.
