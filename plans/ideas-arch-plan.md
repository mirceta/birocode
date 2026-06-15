# Architectural plan in Ideas + expandable dashboard Ideas dock

> **Status (2026-06-15):** **Deployed to live :5099 & merged to main.** On
> `feature/ideas-arch-plan`. The shared `IdeasPanel` is now **tabbed** (Ideas |
> Architectural plan); the plan tab is a single user-written, **very tall**
> plain-text doc (`GET/PUT /api/arch-plan`), and the **dashboard Ideas dock**
> has an expand toggle (300→620px). Browser-verified on an isolated :5210
> instance (`.preview-test/ideas-arch-plan-check.mjs`, ALL PASS).

## Problem

While driving the agent dashboard, the user wants a place to keep a short
**architectural plan** — a single free-text doc they maintain by hand — visible
next to the agent grid, to decide which agent to use next and what to tell it.
The Ideas surface (global list via the shared
[`IdeasPanel`](../client/src/components/ideas/IdeasPanel.jsx)) is the natural
home, but (a) there's nowhere to keep a single standing document, and (b) the
dashboard Ideas dock is a fixed 300px column — too narrow once a plan is open.

## Design

### Backend — one global document (`Services/ArchPlan/`)
- `ArchPlanService` holds a single global string, persisted to
  `%APPDATA%\ClaudeWeb\arch-plan.txt` with the atomic temp+rename write and the
  never-reseed-on-unreadable guard (the `NotesService` pattern).
- `ArchPlanController`: `GET /api/arch-plan` → `{ text }`,
  `PUT /api/arch-plan` `{ text }` → saved. Registered via an
  `ArchPlanModuleExtensions` + one line in `EmbeddedApi` (module convention).

### Frontend — architectural plan in `IdeasPanel` (tabbed)
- `IdeasPanel` is a **two-tab** panel: **Ideas** (composer + filter + list) and
  **Architectural plan** — one visible at a time, chosen tab remembered.
- The Architectural-plan tab fills the panel height (**very tall**): plain
  pre-wrapped text view + Edit→textarea→Save (`ArchPlanSection`).
- Shared component, so it shows in the Ideas tab and the dashboard dock.

### Frontend — expandable dashboard Ideas dock (`Dashboard.jsx`, `dashboard.css`)
- A toggle on the dock header widens `.dash__ideas` from 300px to ~620px (≥2×);
  remembered in localStorage.

## Slices

- **Slice 1 — architectural plan** — backend doc module + the IdeasPanel section.
- **Slice 2 — expandable dock** — the dashboard Ideas dock width toggle.

## Open questions (in `understanding.md`)

1. Global single doc vs per-project? (Assuming global.)
2. Plain text vs markdown rendering? (Assuming plain text.)

## Verification

- Backend: `PUT` then `GET /api/arch-plan` round-trips and survives a restart.
- Frontend: browser-verify (per `docs/claude-web/browser-testing.md`) on an
  isolated instance — view/edit/save in both the Ideas tab and the dashboard
  dock; the dock expands to ≥2× and remembers the width.
