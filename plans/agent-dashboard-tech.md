# Agent dashboard — technical design

The plumbing half of [agent-dashboard.md](agent-dashboard.md). The experience
it serves is in [agent-dashboard-ux.md](agent-dashboard-ux.md).

## This is mostly a new *view* over existing plumbing

- **Agent list** — `DockContext` already holds every agent
  (`{ id, repoId, repoName, sessionId, status, color, stash }`) via `/api/dock`,
  persisted server-side. The dashboard renders this same list as a grid.
- **Per-agent status** — `status` is already `idle | running | done | error`
  (the Agents-tab legend + per-agent colour). Snapshot from `GET /api/runs`.
- **Live activity** — `GET /api/chat/stream?after=N` (SSE) is how the Chat tab
  tails what an agent is currently doing; a cell can read the same.
- **Maximize** — `setActiveTab(id)` + navigate `/studio` (exactly what clicking
  an Agents-tab card does today — `DockContext` ~lines 173-178).
- **Grid baseline** — `PaneStrip` / `useMultiPane` already lay out N panes; the
  dashboard is a sibling (a CSS grid of agent cells, not panes of one agent).

## Where each cell's information comes from

```mermaid
flowchart TD
  Dock["DockContext<br/>GET /api/dock"] --> Card
  Runs["GET /api/runs<br/>snapshot, on a timer"] --> Badge["status badge<br/>idle / running / done / error"]
  Stream["GET /api/chat/stream<br/>(slice 3: opt-in live tail)"] -.-> Activity["latest-activity line"]
  Badge --> Card
  Activity --> Card
  Card["Dashboard cell<br/>name · repo · colour"] -->|click cell| Studio["/studio — the existing view"]
```

## Agent status the badge reflects (already modelled today)

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> running: user sends a turn
  running --> done: graceful finish
  running --> error: crash / cancel
  done --> running: next turn
  error --> running: retry
```

## Liveness depth (the v1 cost tradeoff)

- **Default (v1): status badge + a one-line latest-activity string, refreshed on
  a timer** (poll `/api/runs` + a cheap "latest activity" source). One light
  poll, no per-cell connections.
- **Deferred: a live SSE tail in every cell.** N concurrent `/api/chat/stream`
  connections is the heavy part — prove the cheap version first, then make the
  tail opt-in per agent (slice 3).

## Capability + placement

- Capability flag `agentDashboard`, **Advanced** (per the convention: new
  features default to advanced unless promoted) in `UiModeContext.jsx`.
- **Not a tab.** A top-bar button in `Layout.jsx` (`app-header__actions`)
  toggles a full-screen overlay that replaces the content region and hides the
  bottom nav / pane strip. The button only renders when `agentDashboard` is on
  **and** `DockContext` holds 2+ agents. State (`dashOpen`) lives in
  `StudioShell`; Escape / the in-overlay × / the button itself close it.

## Slices

- **Slice 1 — static grid + open-agent. ✅ built & verified.** First shipped as
  a bottom-nav tab; **redirected** to a top-bar full-screen overlay.
  `agentDashboard` capability; `pages/Dashboard.jsx` + `dashboard.css` render a
  responsive CSS grid of agent cells from `DockContext` (name, status badge +
  dot, colour mark); the whole cell is clickable → `setActiveTab` + `/studio` +
  close. Top-bar entry (`DashboardButton`) gated Advanced + 2+ agents. No tab /
  route / `KnownTabs` entry.
- **Slice 2 — liveness.** Per-cell status refresh + a one-line latest-activity
  string, updated on a timer (and/or reconciled from `/api/runs`).
- **Slice 3 (later, maybe) — live tail.** An opt-in scrolling stream tail per
  cell, bounded so we don't open N heavy SSE streams at once.

## Out of scope

- Spawning / editing / deleting / configuring agents (stays in the Agents tab).
- Any cross-machine / remote-agent aggregation — this is *this* computer's dock.
- Changing how individual agents run.
