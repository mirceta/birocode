# Understanding — Ideas "Active" section

## What you asked for

You can capture ideas, but you can't mark which ones you're **working on right
now**. I'll add an **"Active" section** to the Ideas surface: move an idea into
Active to pin it at the top as current work, and move it back out to return it to
the backlog.

## What I'll do

- **Backend:** add an optional `Active` boolean to each idea (`Note`), defaulting
  to `false` — same no-migration approach as `project` and `priority`. Thread it
  through `POST`/`PATCH /api/notes`.
- **Frontend (`IdeasPanel`, the shared component):** split the list into an
  **Active** group (under a section header at the top) and the existing
  **backlog** below; add a per-card toggle to move an idea in/out of Active
  (optimistic, like the quick priority change).
- **CSS + i18n** for the section header and toggle.
- This automatically appears in **both** the Ideas tab and the dashboard's
  pinned-left panel, since both render the same `IdeasPanel`.
- Browser-verify on an isolated preview before claiming it works.

## Assumptions

- "Active" is a simple **on/off flag**, not a multi-state todo/doing/done
  lifecycle (that's out of scope).
- No manual ordering/drag within Active yet — it keeps the existing newest-first
  sort and priority tint.
- The filter box narrows both the Active and backlog groups.
- The Active section header hides when nothing is active (tell me if you'd rather
  always show it).

Plan: [plans/ideas-active-section.md](plans/ideas-active-section.md).
