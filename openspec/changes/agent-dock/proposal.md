# Proposal: agent-dock

## Why

The dashboard shows *machines* (sources) but not *what runs where*: today the Operator must read the merged feed trail to figure out which repositories agents are working on, on which computer. Yet every `turn.start` / `turn.ended` event in the collected feed already carries its source machine and the repo it ran in — the answer is sitting in data the page has, unassembled.

## What Changes

- A third top-level tab, **Agents** (Activity · Agents · GitHub), renders a **dock**: one card per machine (source), and inside it one **square per repository** that agents have run on there — reconstructed client-side from the `turn.*` events the page already polls (no new endpoint, no extra requests).
- Each repo square shows the repo name, a **running indicator** when a `turn.start` has no matching `turn.ended` yet, and compact stats (runs seen, last activity age).
- Clicking a square (interactive mode) opens the **trail** for that machine × repo: the reconstructed sequence of runs — start/end time, status badge, duration when both ends were seen, turns and cost when reported.
- Old harnesses that emit only `turn.ended` (no `turn.start` — the pilot seeded exactly one type) still get squares and trails from finish events alone; the running indicator simply never lights for them. Machines with no observed agent activity show an explicit empty note, never a blank card.
- Display mode shows the dock (it is glanceable — squares with running lights), inert: no trail drill-down, same rule as the GitHub tiles.

## Impact

- Specs: new capability `agent-dock` (ADDED); `status-monitor` — MODIFY the primary-page requirement (two tabs → three) and the tabbed-navigation display-mode wording (both → all tab content).
- Code: `events-app/index.html` only — a reconstruction map fed from the existing event poll loop, a third tabpanel, CSS for cards/squares/trail. No server changes.
- Constraint carried, not hidden: the reconstruction only reaches as far back as the collector's retained feed — the dock is "recent trail", not history.
