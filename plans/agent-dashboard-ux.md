# Agent dashboard — user experience

The experience half of [agent-dashboard.md](agent-dashboard.md). The plumbing
this rides on is in [agent-dashboard-tech.md](agent-dashboard-tech.md).

## The vision: a wall of screens

Today, checking on another agent means leaving the one you're on: open the
Agents tab, click an agent (it *maximizes* into the normal chat/files/git view),
look, then navigate back. There is no single screen that shows **all** agents
and what each is doing **at the same time**.

The dashboard is a mission-control "wall of screens" sitting *above* the
per-agent tab navigation — a **full-screen overview**, opened from a top-bar
button, where every agent on this machine is a live cell you can read at a
glance. Clicking a cell drops you into the existing full view for just that
agent. It is **not a tab**: it covers the content area (hiding the bottom nav
and pane strip) and the top bar stays so the same button closes it.

## The dashboard at a glance

```mermaid
flowchart TB
  subgraph Dashboard["Agent Dashboard — every agent on this machine, at once"]
    direction LR
    subgraph A["BridgeAgent Dev · running"]
      direction TB
      A1["last: editing PaneStrip.jsx"]
      A2["click cell → open"]
    end
    subgraph B["Workspace 1 · done"]
      direction TB
      B1["last: tests passed"]
      B2["click cell → open"]
    end
    subgraph C["Discussions · idle"]
      direction TB
      C1["last: awaiting input"]
      C2["click cell → open"]
    end
    subgraph D["BridgeAgent · error"]
      direction TB
      D1["last: build failed"]
      D2["click cell → open"]
    end
  end
```

Reached from a **Dashboard button in the top bar**, which only appears in
Advanced mode when the dock holds **2+ agents** (with 0–1 there is nothing to
compare). Closed by the same button, the in-overlay **×**, or **Escape**.

## What each cell shows

- **Agent name + repo** — which project this agent is working in.
- **Status** — a badge + the agent's colour swatch, reusing the Agents-tab
  legend: idle, running, done, error (the "needs attention" signal).
- **A one-line "what's it doing"** — the agent's latest activity, so a stuck
  agent is distinguishable from a working one without opening it (slice 2).
- **The whole cell is the click target** — clicking it opens that agent (the
  dashboard is read + open, not a management screen; there is no separate
  Maximize button).

## Open an agent — into the existing view, and back

```mermaid
flowchart LR
  G["Dashboard overlay<br/>all agents at a glance"] -->|click Agent B's cell| M["open Agent B"]
  M --> S["Full per-agent view<br/>chat · files · git"]
  S -->|top-bar Dashboard button| G
```

Clicking a cell opens that agent in **the per-agent view we already have** (the
same place clicking an Agents-tab card takes you today) and closes the overlay.
Re-opening the dashboard is one tap on the top-bar button.

## UX decisions (resolved)

- **A top-bar button → full-screen overlay, not a tab.** The Agents tab stays
  the place to *create/manage* agents; the dashboard is *overview + open* only.
  Gated to Advanced mode with **2+ agents**.
- **Open target = the current `/studio` per-agent view** (chat/files/git for
  that agent) — the existing open-agent flow.

> Liveness *depth* (a refreshed status line vs. a live scrolling tail in every
> cell) is a cost tradeoff — see [agent-dashboard-tech.md](agent-dashboard-tech.md).
