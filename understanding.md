# Understanding — Hide inactive agents

## What you asked for

A new feature on the **agent dashboard**: a single **toggle switch** labelled
**"Show only important agents"**. When it's **on**, the dashboard hides every
agent dock that **isn't** marked ★ important (the star control in a dock's
top-right corner); when it's **off**, all docks show as they do today. A toggle —
flip it back any time.

"Inactive" here means **not starred important** — it builds on the existing
important/star feature, just hiding the unimportant ones rather than only pinning
the important ones to the front.

## What I'll do (this kickoff step)

- ✅ Made sure I'm on `main` synced with `origin/main`, then cut
  **`feature/hide-inactive-agents`**.
- ✅ Added an **Active feature plans** entry in `plan.md` and wrote the feature
  plan at `plans/hide-inactive-agents.md`.
- ⏳ **Not building yet** — waiting for you to confirm this understanding and the
  design choices below.

## How I plan to build it (confirm before I start)

- A **device-local** toggle (saved per browser, default off), like the existing
  dashboard size/zoom/layout controls — **not** backend-synced, since it's a
  per-viewer view preference.
- Implemented as a **pure view filter**: when on, render only docks whose
  existing backend-synced `important` flag is set. No new dock data, no backend
  change. Applies to both the phone docks and the summary cards.
- An empty-state hint if you turn it on while nothing is starred, so it doesn't
  look like a blank/broken dashboard.

## Assumptions / open questions

- The switch lives in the dashboard's existing control row, inside the
  already-Advanced dashboard (no separate gating).
- **Dependent "together" groups:** if a primary is important but its dependent
  isn't, I'll hide the non-important half (filter strictly per-dock). Flag if
  you'd rather keep grouped pairs together.
- Label wording **"Show only important agents"** taken verbatim from your
  request (will add English + Turkish i18n).
