# Ideas — an "Active" section for what you're working on now

> **Status (2026-06-17):** Built + browser-verified on an isolated port; rode into
> the live `:5099` build with the cache-hardening deploy (not separately
> keep-it-confirmed); **merged to main 2026-06-17**. On
> `feature/ideas-active-section`, branched from `main` @ `71f3778`. Structured per
> [doc-principles.md](doc-principles.md).

## The problem

The Ideas list is one flat, global pile (newest first, optional `project` label,
1–5 `priority`). It captures *everything* you might do, but it doesn't say what
you're **doing right now**. The few ideas you've actually committed to this
session get lost among the backlog, and there's no at-a-glance "current work."

## The goal

Let the user **move an idea into an "Active" section** — a distinct group, pinned
at the top of the Ideas surface — so "what are we working on currently" is
answerable in one glance. Moving it back out returns it to the normal backlog.
This shows in **both** Ideas surfaces (the Ideas tab and the dashboard's
pinned-left panel) because both render the shared `IdeasPanel`.

## How it works

Add an optional **`Active`** flag to each idea (a `Note`), exactly the way
`Project` (free-text label) and `Priority` (0–5) were added — a new field on the
`Note` record that defaults to `false`, so older `notes.json` entries need **no
migration** (System.Text.Json fills the default). The frontend splits the visible
list into two groups:

- **Active** — `active === true`, rendered under an "Active" section header at the
  very top.
- **Backlog** — everything else, in the existing newest-first order below.

Each idea card gets a control to **toggle Active** (move in / move out), patched
optimistically through the existing `/api/notes/{id}` endpoint — the same
optimistic pattern as the card's quick priority change.

## Decisions (defaults — change any in Open questions)

- **A boolean `Active`, not a multi-state status.** The ask is a binary "currently
  working on this / not." A richer todo/doing/done lifecycle is out of scope.
- **Reuse the existing `PATCH /api/notes/{id}`** (thread an `active` field through
  the request + `NotesService.Update`) rather than a new endpoint — mirrors how
  `priority` rides the same update.
- **Within the Active section, keep the existing sort** (newest-first, priority
  tint still applies). No manual ordering/drag in v1.
- **The filter applies to both sections.** Typing in the filter box narrows Active
  and Backlog alike.

## Slices

1. **Active flag + grouped section.** Backend `Active` field on `Note` + through
   the API; `IdeasPanel` splits into Active / Backlog with a section header and a
   per-card move-in/out toggle; CSS + i18n. Browser-verified on an isolated port.
   *(This is the whole feature as asked.)*

## Out of scope (for now)

- A full todo lifecycle (doing/blocked/done) or columns/kanban.
- Manual reordering / drag within the Active section.
- Coupling to the loop-autopilot or agent docks (separate concern).

## Open questions (defaults chosen; tell me to change)

- **Empty Active section:** hide the header entirely when nothing is active, or
  always show it with an empty-state hint? (Default: hide when empty.)
- **Active + priority:** any interaction, or are they fully independent? (Default:
  independent — an idea can be active at any priority.)
- **Collapse:** should the Active section (or Backlog) be collapsible? (Default:
  no — both always shown.)

## Verification

Browser-verified on an isolated preview instance: add an idea, toggle it Active →
it jumps to the Active section and persists across reload + via the API; toggle
off → returns to Backlog; filter narrows both groups. Seed/assertions to live in a
`verify-ideas-active.mjs` Playwright script.
