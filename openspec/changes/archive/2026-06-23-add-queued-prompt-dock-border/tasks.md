# Tasks

## 1. Detect queued prompts and toggle a tile modifier

- [x] 1.1 In `client/src/components/dashboard/PinnedAgent.jsx`, add a `phone--queued` modifier
      to the tile wrapper when `tab.stash?.length > 0` (alongside the existing
      `--important`/`--waiting` modifiers).
- [x] 1.2 In `client/src/pages/Dashboard.jsx` card render, add a `dash-cell--queued` modifier
      when the tab's stash is non-empty.
- [x] 1.3 In `client/src/pages/Agents.jsx`, add an `agent-card--queued` modifier when the tab's
      stash is non-empty.

## 2. Style the thick black border

- [x] 2.1 In `client/src/pages/dashboard.css`, add `.dash-cell--queued` / `.phone--queued`
      with `border: 6px solid #000`, placed AFTER the `--important` / recency / `--active` /
      colored rules with matching (two-class) specificity so it wins precedence (design
      Decision 2). The `--waiting` box-shadow uses a different property and still layers over it.
- [x] 2.2 In `client/src/pages/agents.css`, add `.agent-card--queued` with the same thick black
      border.

## 3. Gate & modes

- [x] 3.1 Confirm the border renders only where the dock renders — it inherits the
      `agentDashboard` / `agentDock` and `promptStash` Advanced gates; Basic mode shows neither
      the dock nor a stash, so no new gate is needed (satisfied by construction).

## 4. Understanding app

- [x] 4.1 Overwrite `understanding-app/index.html` with a companion visual: an interactive dock
      grid where clicking a tile toggles a queued prompt (black border) and important/recency
      tiles demonstrate the precedence; build-less, relative URLs.

## 5. Verify

- [x] 5.1 Build the frontend (`npm --prefix client run build`) — clean; the three `--queued`
      classes + the `#000` precedence rule confirmed in the built bundle. **Verified live on the
      deployed `:5099` harness — operator confirmed the thick black border appears on agents with
      queued prompts.**
- [x] 5.2 `openspec validate add-queued-prompt-dock-border --strict` passes.
