# Design — queued-prompt dock border

## Context

The dock renders an agent as a tile in three places, all reading the same dock-tab object:
the dashboard **phone** (`PinnedAgent.jsx`, a live chat in a frame), the dashboard **card**
(`Dashboard.jsx`, a cheap `dash-cell` summary), and the **Agents** list card
(`Agents.jsx`, `agent-card`). Each already toggles className modifiers off the tab's state
(`--active`, `--important`, `--waiting`, `data-recency`, `data-colored`). Queued prompts are
already on each tab as `tab.stash` (`{id,text,createdAt}[]`, from `/api/dock`). So this feature
is a thin presentation layer: one more modifier, one more CSS rule — no new state or fetch.

## Decision 1 — A border, painted black, "very thick"

**Chosen: `6px solid #000`, matching the established thick-border scale.** The dock's
`--important` state is already `6px solid #ef4444`, and recency borders are `5px`. Reusing 6px
keeps the dock's visual rhythm and reads as unmistakably "thick" next to the 1px default.
Black (`#000`) is unused by any other tile state (which are red/amber/green/blue/purple), so it
won't be confused with them.

*Considered:* 8–10px for extra emphasis (rejected — overpowers small cards in a dense grid and
breaks the 5–6px scale); a `box-shadow` glow like `--waiting` (rejected — the ask is explicitly
a *border*, and a border is the stronger, non-fading cue).

## Decision 2 — Precedence vs the other border states

A tile can be queued AND important/recent/active/colored at once, and several of those also
paint the border. **Chosen: the queued black border wins** — its CSS rule is placed after the
`--important` / recency / `--active` / colored rules so it overrides them while prompts are
queued.

- **Rationale:** a queued prompt is *actionable and rarer* than recency/active; the operator
  must be able to spot "this agent has work waiting" at a glance, so it earns top priority on
  the one border slot.
- **Trade-off:** while queued, the red `--important` border is superseded by black, so an agent
  that is both important and queued shows black. Accepted for v1 — both are "look at me" states
  and queued is the one with a pending action. The `--waiting` amber **box-shadow** uses a
  different mechanism and still layers *on top*, so a waiting+queued tile shows the amber glow
  around the black border (no conflict).
- *Future option (out of scope):* a compound treatment (black border + a small red corner mark)
  if losing the important hue proves confusing.

## Decision 3 — What counts as "has queued prompts"

`tab.stash.length > 0` — the **per-agent** stash only. The global (no-agent) main-chat queue
(`globalStash` in `DockContext`) is not an agent and has no dock tile, so it's irrelevant here.
The border appears the instant the stash becomes non-empty and clears when it returns to empty
(both already drive re-renders through the dock context).

## Decision 4 — Gate

No new flag. The border is rendered only by the dock surfaces, which are themselves behind the
`agentDashboard` / `agentDock` Advanced gates, and queued prompts only exist when `promptStash`
(also Advanced) is on. So Basic mode neither shows the dock nor produces a stash — the feature
is gated transitively, with nothing to add.

## Risks / trade-offs

- **Color semantics:** black is a new tile color; this design reserves it exclusively for
  "queued", so the meaning stays unambiguous as long as no other state later claims black.
- **Precedence surprise:** an operator used to the red important border may notice it turn black
  when they queue a prompt on an important agent — documented above as the deliberate trade-off.
