# Understanding — Files tab absorbs the Plan tab, with pins

## The idea (your refinement)
No separate Plan tab and no one-tap shortcut (B is out). The **Files tab** is
the single home for viewing files:

- Opening Files **reopens the file you were last looking at**; first time (or if
  that file is gone) it opens a **default — `plan.md`**.
- The **upper-left** corner returns you to the folder-tree / primary view.
- **Pins**: a small curated set at the top for the files you actually want —
  seeded with **`plan.md`** and **`CLAUDE.md`**, and you can **pin any other
  file** too. One tap on a pin opens it.
- While you're **viewing a file** (not the tree), the Files tab **polls it every
  5 s** for fresh content — exactly what the Plan tab did for `plan.md`, now for
  any open file.

Net: the Plan tab goes away; `plan.md` is just the default pinned file in the
richer Files viewer (which already has back/forward history).

## My judgment calls (tell me if any are wrong)
- **Pins are per-project and backend-synced** (like Ideas/visibility), so they
  follow you across devices. Seeded with `plan.md` + `CLAUDE.md`; you add/remove
  via a 📌 toggle in the file viewer's top bar.
- **Last-opened file is remembered per project** (local to the device — it's a
  view position, not content); default `plan.md` when there's no memory or the
  file vanished.
- **Poll every open file** (not just `plan.md`) every 5 s while visible.
- **Remove the Plan nav tab** (retire `Plan.jsx`, `planTab`/`planRawView`).

## Sliced so we ship safely
1. Files opens to last/default file + return-to-tree + 5 s poll + remove Plan
   tab; pins shown as a fixed `plan.md`/`CLAUDE.md` strip.
2. Make pins user-editable + backend-synced (pin/unpin any file).

Say "create it" (and veto anything above) and I'll start slice 1 on
`feature/plan-files-merge`.
