# Understanding — ideas pinned left of the dashboard

## Goal (as I read it)

On the **agent dashboard** (the full-screen top-bar overlay that shows the grid
/ "wall of phones" of agents), pin the **Ideas** (per-project notes) as a panel
down the **left side**, with the agent grid to its right. Mission-control feel:
your notes always in view while you watch the agents.

## What I'll do now (this step)

- Branch `feature/ideas-pinned-dashboard` (done).
- Write the **start** of `plans/ideas-pinned-dashboard.md` — problem, a rough
  design (reuse the shipped Ideas `/api/notes` backend; add a left panel inside
  `pages/Dashboard.jsx`'s `.dash`), and the open questions. Not a full spec yet.

## Builds on two existing features

- **Ideas** (`plans/ideas-tab.md`, shipped): per-project notes via `/api/notes`
  (`NotesController`/`NotesService`), rendered by `pages/Ideas.jsx`.
- **Agent dashboard** (`plans/agent-dashboard.md`, in flight on
  `feature/agent-dashboard`; slices merged to main): `pages/Dashboard.jsx`, a
  `.dash` overlay = header + `.dash__grid`.

## The big open question

The dashboard spans **all projects' agents**, but Ideas are **per-project**. So
*whose* ideas pin on the left? Leaning: the **currently-selected project**
(`currentRepoId`) — but this needs the user's call (see the plan).
