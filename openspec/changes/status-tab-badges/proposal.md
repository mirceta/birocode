# Proposal: status-tab-badges — the Status tab's build / fleet info as badges

## Why

The Management App's Status tab dumped its machine facts as raw text: each machine
header read "build 553fb73 · behind the hub · accepts sends · accepts upgrades · gate
closed · sends not allowed" and "2 agents · 🏛 2 managed · ▶ 1 running", an open agent's
detail was two more "a · b · c" lines, and the Overview values were coloured monospace
words. None of it reads at a glance and none of it matched the chips and tiles the rest
of the dashboard uses. The Operator asked for clean, homogeneous badges (fleet task
a25ee2de).

## What

- **One badge primitive** (`StatusBadge`, `.fs__badge`) with the Overview's own tone set
  (ok / warn / bad / muted / unknown / accent, plus mono for a commit), defined for the
  light and dark schemes on the Management App's tokens.
- **Machine header**: build (mono), hub sync (peers: "same build as hub" / "behind the
  hub"), accepts sends / no sends, accepts upgrades / no upgrades, gate open / closed,
  and for peers sends allowed / not allowed — one pill each; an unreachable machine
  shows its status (bad) and detail. The counts (agents, managed, running, hidden by
  filter) are pills on the right. The head's hub build is a mono pill.
- **Agent detail**: the branch state, dirty flag, running/idle, last actor,
  availability, claimed reason, handed to the arch, pinned, arch scope, dock and goal
  are one badge each; the `data-claimed-reason` / `data-driven-by-goal` hooks stay.
- **Overview rows** (shared with the header strip's Machine tile): a toned value renders
  as a badge; an "unknown — why" / "no session — why" / "unavailable — why" value
  becomes the state as a badge with the reason in full beside it. Plain values (build
  string, clock, names) stay text; meters stay meters.
- **Stale board rows** carry a warn badge. **Stale tasks** in the Overview counts the
  feed's list (it stringified the array to an empty cell before).
- Presentation only: every field stays, every value is the fleet feed's, an unknown
  stays unknown. The Agents subtab layout, per-machine grouping, agent chips (colour,
  mark, dot, repo-only label), the keep-alive row and the Scoreboard tab are untouched.

## Out of scope

Changing the fleet feed, the Overview field mapping, or the dock strip's own chips.
