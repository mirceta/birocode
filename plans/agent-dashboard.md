# Agent dashboard — a grid overview of all agents

> **Status (2026-06-14):** IN PROGRESS, on `feature/agent-dashboard`.
> Slice 1 **built & browser-verified**, then **redirected**: the dashboard is a
> **top-bar full-screen overlay** (Advanced + 2+ agents), not a bottom-nav tab.
> Slices 2-3 not started.

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

1. **Static grid + open-agent** ✅ built — top-bar full-screen overlay; click a cell to open that agent.
2. **Liveness** 👈 **NEXT** — per-cell status + a one-line "what's it doing", on a timer.
3. **Live tail (later, maybe)** — an opt-in scrolling stream tail per cell.

> **Next step = Slice 2.** Full detail (data sources, the v1 liveness cost
> tradeoff, where it plugs in) is in
> [agent-dashboard-tech.md § Slices](agent-dashboard-tech.md#slices).
