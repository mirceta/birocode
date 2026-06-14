# Agent dashboard — a grid overview of all agents

> **Status (2026-06-14):** IN PROGRESS, on `feature/agent-dashboard`.
> Slice 1 **built & browser-verified**, then **redirected**: the dashboard is a
> **top-bar full-screen overlay** (Advanced + 2+ agents), not a bottom-nav tab.
> Slice 2 (liveness) **built & browser-verified** — cells poll status + a
> one-line activity + per-cell git state on a 5s timer, in a square-ish grid.
> Slice 4 (the **"wall of phones", Chat-only**) **built & browser-verified** —
> a Cards/Phones toggle; Phones renders each agent's live Chat in place. Slice 3
> (live tail) not started.

## Direction as of 2026-06-14

Two decisions came out of reviewing the dashboard with the user:

1. **Scope stays read-only (Phase 0, pending revert).** A management pass
   (New agent / Pull main / colour swatch / close ×) was prototyped in the
   working tree but **never committed or deployed**; per the user it is being
   **reverted**. Creating/editing/deleting agents stays in the Agents tab; the
   dashboard is **view + switch + richer read-only info** (status, activity,
   git state). Keep: square grid, liveness, git state, `lib/gitSync.js`.
   Revert: `lib/agentColors.js` (delete) + its import in `Agents.jsx`.

2. **Slice 4 = the "wall of phones".** Render each agent's *real, live* view
   inside its dashboard cell — like several mobile phones side by side, each
   showing one agent's tab. The full version is a real project; the
   **Chat-only** version is a focused, safe milestone we can ship.

### Feasibility (researched 2026-06-14, grounded in the code)

| Version | Difficulty | Biggest problem |
|---|---|---|
| **Full** (per-agent Files/Git/Terminal too) | **~6.5/10** | The global `_repoId` singleton in `api/client.js`: ~80 API call-sites, only ~8 pass an explicit `{ repoId }` override; the rest inherit the one "current repo". N live agents = N current repos at once → risk of **silent cross-repo bleed**. Threading `repoId` through ~72 call-sites is the slog. |
| **Chat-only** (recommended first) | **~4/10** | The repo-global blocker **does not apply** — every chat call already threads `{ repoId }`. The remaining obstacle is contained: `ChatContext` exposes only the *single active* conversation, so it must be refactored to address conversations by key (`useChatFor(key, repoId)`). One well-structured file. |

Detail (which calls, why chat is safe, the `ChatContext` refactor, what to
avoid) lives in **[agent-dashboard-tech.md](agent-dashboard-tech.md)**; the
phones vision and open questions in
**[agent-dashboard-ux.md](agent-dashboard-ux.md)**.

> **Chat-only is a deliberate stopping point, not a dead end.** It ships a real
> wall-of-phones (each phone = that agent's live chat). Adding per-agent
> Files/Git/Terminal tabs later is what re-introduces the 6.5/10 repo-global work.

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

0. **Scope revert** ✅ done — stripped the uncommitted management powers; kept view + switch + liveness + git state.
1. **Static grid + open-agent** ✅ built — top-bar full-screen overlay; click a cell to open that agent.
2. **Liveness** ✅ built — per-cell status + one-line activity + git state, polled on a 5s timer, square grid.
3. **Live tail (later, maybe)** — an opt-in scrolling stream tail per cell.
4. **Wall of phones (Chat-only)** ✅ built & verified — a Cards/Phones toggle; Phones renders each agent's live `<Chat>` view, pinned to its repo.

> Slices 0-2 and 4 are shipped. Slice 3 (per-cell SSE tail) is optional. A
> *full* wall of phones (per-agent Files/Git/Terminal too) remains future work —
> it needs the repo-global plumbing described below. Full detail in
> [agent-dashboard-tech.md § Slices](agent-dashboard-tech.md#slices).
