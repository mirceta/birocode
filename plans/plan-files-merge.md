# Files tab absorbs the Plan tab — default-open + pins + live-poll

> **Status (2026-06-14):** Slices 1 & 2 BUILT & BROWSER-VERIFIED, pending
> deploy. Branch `feature/plan-files-merge`. Slice 1 (verify-plan-files-merge.mjs
> 9/9 on :5099) and slice 2 (verify-plan-files-pins.mjs 7/7 on isolated :5201
> with the new Pins backend). The Files tab is the single file surface: default/
> remembered open, return-to-tree, 5 s poll, and per-project backend-synced pins
> (📌 toggle in the viewer bar) seeded with plan.md + CLAUDE.md. Plan tab removed.

## Problem

The Plan tab and Files tab are two renderers of "a markdown file." `FileViewer`
(Files) is the richer one — markdown, raw toggle, in-doc links, **back/forward
history ◀▶**, tree context. `Plan.jsx` is the thinner one — it only adds a 5 s
**live-poll** of `plan.md` and a "no active plan" empty state, and it has **no
history**. The plan is just a file (`plan.md` at the repo root); we don't need a
second tab for it.

## Goal

The **Files tab is the single file surface**:

- It **reopens the last-viewed file**; first time / missing → opens the default
  **`plan.md`**. The **upper-left** returns to the folder tree (primary view).
- **Pins** at the top — a curated quick-open set seeded with `plan.md` and
  `CLAUDE.md`, extensible to any file.
- While a file is open (not the tree), **poll it every 5 s** for fresh content
  (what the Plan tab did, now for any file).
- The **Plan nav tab is removed**; its only unique behaviours (poll, empty
  state) move into the Files viewer.

## Decisions

1. **No Plan tab, no shortcut** — `plan.md` is reachable as the default-open
   file and the first pin. (User rejected keeping a one-tap Plan nav entry.)
2. **Pins: per-project, backend-synced** (mirror Ideas/notes — `pins.json`
   keyed by repo id, scoped by `X-Repo-Id`, atomic writes). Seeded with
   `plan.md` + `CLAUDE.md`. Pin/unpin via a 📌 toggle in the `FileViewer` bar.
3. **Last-opened file: per-project, device-local** (it's a view position, not
   content) — `localStorage` keyed by repo id, default `plan.md`. Falls back to
   the tree if the remembered file 404s.
4. **Poll every open file** (not `plan.md`-only) every 5 s while the page is
   visible; pause when showing the tree.
5. Retire `planRawView` (FileViewer's raw toggle subsumes it).

## Slices

**Slice 1 — unify + default-open + poll + remove Plan tab.**
- `Files.jsx`: on mount, open the remembered file for the repo (default
  `plan.md`); a fixed pin strip (`plan.md`, `CLAUDE.md`) at the top of the tree;
  poll the open file every 5 s while visible; remember the open file per repo;
  if the default/remembered file 404s, show the tree (or the existing empty
  state for `plan.md`).
- `FileViewer.jsx`: already has back-to-tree + history + raw — wire history on
  by default (it's currently gated by the `docLinks` feature; keep that).
- `tabRegistry.jsx` + `SettingsController.KnownTabs`: remove the `plan` entry.
  Retire `Plan.jsx` + `plan.css`; drop `planTab`/`planRawView` from the
  capability map. Saved tab orders that list `plan` simply ignore it.
- i18n (en + tr): pin-strip labels; reuse `plan.none`/`plan.noneHint` for the
  missing-`plan.md` empty state; drop dead `plan.*`/`nav.plan` keys.
- Docs: mark `plans/plan-tab.md` superseded; fix CLAUDE.md / networking
  references that call out a separate Plan tab.

**Slice 2 — user-editable pins.**
- Backend `pins.json` per repo (+ `GET`/`POST /api/pins` scoped by `X-Repo-Id`),
  seeded with `plan.md` + `CLAUDE.md` for repos with none.
- 📌 pin/unpin toggle in the `FileViewer` bar; the pin strip reflects the saved
  set; pinning a non-existent path is allowed (it just 404s on open).

## Verification

Isolated `:5201` + Playwright `verify-plan-files-merge.mjs`: Files opens to
`plan.md` by default; the pin strip shows `plan.md` + `CLAUDE.md` and tapping
`CLAUDE.md` renders it; after following a subplan link, **◀ returns**; a live
edit to the open `plan.md` appears within ~5 s; returning to the tree stops the
poll; the remembered file reopens on revisit; the missing-`plan.md` empty state
shows; the Plan nav tab is gone. Slice 2 adds: pin/unpin persists across a
reload and is per-project. Read a screenshot before claiming done.
