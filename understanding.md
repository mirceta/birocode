# Understanding — priority for ideas

## Goal

Let each idea carry a **priority** (five levels), settable from the Ideas surface,
and make the idea card's **background grow more brightly red as the priority
rises**. This must work in **both** places ideas appear: the **Ideas tab** and the
**Ideas section on the dashboard** — which is automatic, since both render the one
shared `IdeasPanel` component.

## Concrete things I'll do

- **Backend** (`NotesService` / `NotesController`): add an integer `Priority`
  (0 = none, 1–5) to the `Note` record; accept it on create (`POST /api/notes`)
  and edit (`PATCH /api/notes/{id}`), clamped to 0–5. No migration needed — old
  notes without the field default to 0 (System.Text.Json tolerates the absence,
  same as `Project` did).
- **Frontend** (`IdeasPanel.jsx`): a small **1–5 priority picker** on each idea
  (and in the composer), persisted via the existing add/edit calls. Set
  `data-priority` on the `.idea` card.
- **Styling** (`ideas.css`): five red tints keyed off `data-priority`, escalating
  from a faint red at level 1 to a strong bright red at level 5, keeping the idea
  text legible at every level. Applies on both surfaces automatically.
- **i18n**: add the priority label/aria keys to `en.json` + `tr.json`.

## Assumptions

- Priority is **visual only** for this feature — it tints the card; it does **not**
  reorder the list (the list stays newest-first with the existing fuzzy filter).
  Sorting by priority is noted as a possible later slice.
- 0/"none" is the default and renders as the current neutral card (no red).
- No new UI-mode gating — the control rides along with the existing Ideas surface.

## Verify

Build, then browser-verify on an isolated preview (self-dev + browser-testing
docs): set each level 1–5 on an idea in the Ideas tab and confirm the card
reddens progressively and persists across reload; confirm the same idea shows the
same tint in the dashboard Ideas panel.
