# Priority for ideas — redder card as priority rises

> **Status (2026-06-15):** **BUILT & browser-verified**, not yet merged or
> deployed. On `feature/idea-priority`. Each idea now carries a `Priority` (0–5);
> a 1–5 picker on the card/composer/edit form sets it, and the card background
> reddens with the level on both the Ideas tab and the dashboard Ideas panel.
> Verified on an isolated :5201 preview (`.preview-test/idea-priority-check.mjs`:
> levels 1→5 reden monotonically, persist across reload + via the API, and the
> dashboard panel mirrors the tint; live :5099 untouched — built to an isolated
> outDir + bin). Single primary slice; sort-by-priority remains an optional
> follow-up.

## Problem

Ideas (plans/ideas-pinned-dashboard.md) are a flat, newest-first list with an
optional `project` label and a fuzzy filter (plans/ideas-filter-project.md).
There is no way to mark that one idea matters more than another, so the list
gives no at-a-glance sense of what to tackle first.

## Goal

Give each idea a **priority** with **five levels**, settable from the Ideas
surface, and make the idea card's **background more brightly red the higher the
priority**. It must apply in **both** places ideas render — the **Ideas tab**
(`pages/Ideas.jsx`) and the **dashboard Ideas panel** — which comes for free
because both use the one shared `IdeasPanel` component.

## Current state (what's already there)

- One global ideas list, backend-synced: `NotesService` persists
  `Note(Id, Text, Project, CreatedAt, UpdatedAt)` to `%APPDATA%\ClaudeWeb\notes.json`
  (atomic temp+rename; never reseeds on an unreadable file).
- `NotesController`: `GET/POST/PATCH/DELETE /api/notes`; `NoteRequest(Text, Project)`.
- `IdeasPanel.jsx` owns the composer + list + per-card edit/delete and is the
  single renderer for both surfaces. Each card is a `.idea` div (`ideas.css`).
- `Project` was added as an optional field with **no migration** — older notes
  simply lack it and `System.Text.Json` tolerates the absence. Priority follows
  the same pattern.

## Slice — set priority + tint the card

**Backend**
- Add `int Priority` to the `Note` record (0 = none, 1–5). Default 0; old notes
  without the field deserialize to 0, so no migration.
- `Add`/`Update` accept a priority and **clamp to 0–5**; persist via the existing
  `Save()`.
- Extend `NoteRequest` to `(Text, Project, Priority)`; `POST` and `PATCH` pass it
  through. `PATCH` is the path used to change an existing idea's priority.

**Frontend (`IdeasPanel.jsx`)**
- A compact **1–5 priority picker** on each idea card (view mode, for fast
  setting) and in the composer/edit form. Changing it calls the existing
  `apiPatch('/notes/{id}', { text, project, priority })` (optimistic update like
  edit/delete already do).
- Render `data-priority={n.priority || 0}` on the `.idea` element.

**Styling (`ideas.css`)**
- Five red tints keyed off `.idea[data-priority="1".."5"]`, escalating from a
  faint red (1) to a strong, bright red (5). Keep the idea **text legible** at
  every level (darken text / lighten as needed at the top end). Level 0 keeps the
  current neutral `--color-surface` card.

**i18n** — priority label + level aria text in `en.json` and `tr.json`.

## Decisions / scope

- **Visual only.** Priority tints the card; it does **not** reorder the list
  (stays newest-first with the existing fuzzy filter). *Optional later slice:*
  sort/group by priority.
- **No new UI-mode gating** — the control rides along with the existing Ideas
  surface (the Ideas tab is already `ideasTab: advanced`).
- 0/"none" is the default and looks exactly like today's card.

## Verification

Browser test (docs/claude-web/browser-testing.md) on an isolated preview
(self-dev): in the Ideas tab, set each level 1→5 on an idea and confirm the card
background reddens progressively, the text stays readable, and the level persists
across reload (backend-synced). Open the **dashboard Ideas panel** and confirm the
same idea shows the same tint there. An idea left at "none" shows the neutral
card. Hygiene: remove any test ideas afterward.
