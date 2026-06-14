# Agent dashboard — a grid overview of all agents

> **Status (2026-06-14):** PLANNED, on `feature/agent-dashboard`. Not started.
> Design defaults below are chosen but unconfirmed — flagged in the detail docs.

## Why

To see what another agent on this machine is doing today, you open the Agents
tab, click one (which *maximizes* it into the normal chat/files/git view), look,
then navigate back. There is no single screen showing **all** agents and what
each is doing **at the same time**. The dashboard is a mission-control grid of
live agent cells, each with a **Maximize** button that opens that agent in the
existing full view.

## Two views of this plan

- **[User experience](agent-dashboard-ux.md)** — the wall-of-screens vision,
  what each cell shows, the maximize-and-back flow, and the UX decisions.
- **[Technical design](agent-dashboard-tech.md)** — the existing plumbing we
  reuse (`DockContext`, `/api/runs`, `/api/chat/stream`, the open-agent flow),
  the data-flow and status diagrams, the capability flag, and the slices.

## Slices (detail in the technical design)

1. **Static grid + maximize** — the grid of agent cards + per-cell Maximize.
2. **Liveness** — per-card status + a one-line "what's it doing", on a timer.
3. **Live tail (later, maybe)** — an opt-in scrolling stream tail per cell.
