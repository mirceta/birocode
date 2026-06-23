# Add a queued-prompt border to agent dock tiles

## Why

Queued prompts (the per-agent prompt stash) let the operator line up the next turn for an
agent while it's busy. But in the agent dock, an agent with prompts waiting looks identical to
one with an empty queue — the only cue lives inside that agent's own chat (the stash chips). So
when scanning a grid of many agents, the operator can't tell which have work queued without
opening each one. Queued prompts are actionable state: they sit unsent until the agent is free,
so missing them stalls work. The dock already paints thick, color-coded borders for other
at-a-glance states (important, recency), proving the affordance — queued prompts deserve the
same. This change paints an agent's dock tile with a thick black border whenever it has one or
more queued prompts.

## What Changes

- **New visual state on agent dock tiles** — a tile is drawn with a **thick black border**
  whenever its agent has a non-empty per-agent prompt stash (`tab.stash.length > 0`), and
  returns to its normal border when the queue empties.
- **Across every dock surface that shows an agent as a tile** — the dashboard's live **phones**
  (`PinnedAgent`) and summary **cards** (`dash-cell`), and the **Agents** list cards
  (`agent-card`).
- **Defined precedence** — while prompts are queued, the black border takes visual precedence
  over the tile's other color-coded border states (active, recency, colored-agent) so the
  queued signal is never hidden (see `design.md` for the trade-off vs the red "important" border).
- **Presentation-only** — a className toggle driven by existing per-tab stash data; no new
  state, no backend change.
- **New capability `agent-dock`** seeded by this change's delta (seed-and-grow).

## Impact

- **Affected specs:** `agent-dock` (new capability, seeded by this change).
- **Affected code (frontend):** `client/src/components/dashboard/PinnedAgent.jsx` and
  `client/src/pages/Dashboard.jsx` (toggle a `--queued` modifier on the tile from
  `tab.stash.length`); `client/src/pages/dashboard.css` (new `--queued` thick-black-border rule,
  modeled on the existing `--important` 6px rule); `client/src/pages/Agents.jsx` +
  `client/src/pages/agents.css` (same toggle on `agent-card`).
- **Data source:** the per-tab `stash` array already on `/api/dock` (`DockContext.jsx`) — read,
  not changed. No `ClaudeWeb.App/` changes.
- **Gate:** inherits the existing `agentDashboard` / `agentDock` and `promptStash` Advanced-mode
  gates — Basic mode is unaffected.
- **Out of scope:** no count/number badge (border only), no change to how prompts are queued or
  sent, the global (no-agent) main-chat queue is unaffected, and no new color states are added.
