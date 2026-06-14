# Understanding — Agent dashboard (grid overview of all agents)

## The goal

Make the whole machine **controllable at a glance**. Today, to see what another
agent is doing I have to open the Agents tab, click into one agent (which
maximizes it into the normal chat/files/git view), look, then navigate back to
the agent I was on. There's no single screen that shows *all* agents and what
each is doing *right now* at the same time.

You want an **agent dashboard**: a grid where each defined agent on this
computer is a live cell. Each cell shows enough to know what's going on inside
that agent without opening it. A **Maximize** button on a cell expands that
agent into the full single-agent view we already have (the bottom tab
navigation — chat/files/git/etc. scoped to that agent).

This is like a mission-control / "wall of screens" view sitting *above* the
existing per-agent tab navigation.

## What exists today that we'll reuse (not rebuild)

- **The agent list** — `DockContext` already holds every agent
  (`{ id, repoId, repoName, sessionId, status, color, stash }`), backed by
  `/api/dock`, persisted server-side. The dashboard reads this same list.
- **Per-agent live status** — `status` is already one of
  `idle | running | done | error` (the badges/legend the Agents tab shows).
  Live activity comes from `GET /api/runs` (snapshot) + `GET /api/chat/stream`
  (SSE tail of what the agent is currently saying/doing).
- **Maximize = the existing "open agent" action** — `setActiveTab(id)` +
  navigate to `/studio`, exactly what clicking an Agents-tab card does now.
- **Grid layout baseline** — the multi-pane (`PaneStrip` / `useMultiPane`)
  already lays out N panes; the dashboard is a sibling idea (a CSS grid of
  agent cells rather than panes of one agent).

## What I'd actually build (high level — for your confirmation, not final)

1. A new **Agent dashboard** surface (Advanced-gated, new capability flag) that
   renders every dock agent as a card in a responsive grid.
2. Each card shows: agent name + repo, a status badge (idle/running/done/error,
   reusing the existing legend + colour), and a short **live "what's it doing"
   line** — e.g. the latest assistant/tool activity — so I can tell a stuck
   agent from a working one at a glance.
3. A **Maximize** control per card that opens that agent full-screen via the
   existing open-agent flow.
4. Lightweight live updates (poll `/api/runs`, and/or a small streamed tail) so
   the grid stays current without me clicking in.

## Open questions for you (these change the design)

1. **New tab vs. evolve the Agents tab?** The Agents tab is already a list of
   agent cards. Is the dashboard a *new* tab (e.g. "Dashboard"), or should it
   *replace/become* the Agents tab's layout (cards → live grid)?
2. **How "live" per cell?** Cheapest: status badge + last-known activity line,
   refreshed on a timer. Richer (and heavier): an actual scrolling tail of each
   agent's stream in every cell. Which do you want for v1?
3. **Maximize target** — confirm "the mode we currently have" = the normal
   `/studio` per-agent chat/files/git view (what clicking an Agents card does
   today). Yes?

## Assumptions (tell me if wrong)

- Scope = agents on *this* computer (the dock list), not cross-machine.
- Creating/deleting/configuring agents stays in the existing Agents tab — the
  dashboard is **read + maximize**, an overview, not a management screen.
- One feature, one branch off `main` (per our git workflow).

## Out of scope (for now)

- Spawning or editing agents from the dashboard.
- Any cross-machine / remote-agent aggregation.
- Changing how individual agents run.
