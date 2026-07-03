## Why

The operator now runs agents on five machines at once and has bought a third
(status) monitor, but has no single glanceable surface answering: *which agents
are running where, which are blocked waiting on me, and what state are my
GitHub repos in?* Today that knowledge lives in five separate harness UIs and
on github.com, so open tasks on other machines routinely go unnoticed. The
practice this follows is well established in agentic engineering — "mission
control" wallboards (Mission Control, claude-view, Conductor, AgentsRoom, and
Marc Nuri's cross-device dashboard all converge on the same shape): per-device
cards showing agent status (working / idle / **awaiting input**), the current
task, project + branch, and a PR link — with *awaiting-input* as the
highest-value signal (it is the attention queue; the human is the bottleneck)
and glanceability as the design rule (no interaction required, alert-first
ordering, readable from across the desk). Cross-repo GitHub wallboards
(GitactionBoard, GitHub's repository dashboard) and burn-rate tickers
(ccusage, Claude-Code-Usage-Monitor) are the two companion panels people run.

birocode is uniquely positioned to host this: the **event-feed-collector**
already polls the other machines' harness event feeds — the fleet panel's data
spine exists.

## What Changes

- A new **Status Monitor** surface: a full-screen, dark, high-contrast
  wallboard designed for the small third monitor. Glanceable by rule: no
  interaction needed, auto-refreshing, alert-first ordering (blocked things
  float to the top and are visually loud).
- **Fleet panel** — one card per machine (collector source): reachability,
  refusal states (ip-blocked / needs-credential / bad-credential / throttled),
  and the latest agent activity the feed already carries.
- **Attention panel** — a single ordered "needs me" queue across all machines:
  sources in refusal states now; agents awaiting input once the feed carries
  that signal (follow-up change, see below).
- **GitHub panel** — across the operator's repos, the list derived
  automatically from the registered Repos' git remotes: open PRs (age,
  draft/ready, review state) and latest CI status per default branch,
  red/green wallboard style, reusing the existing `github-credentials`
  capability.
- **One surface, not two** (operator decision 2026-07-03, after seeing the
  first cut live): the attention queue, fleet status, and GitHub panel render
  on the **events-app primary page itself** — its Sources panel already *is*
  fleet administration, so a separate `board.html` duplicated the fleet one
  click away. The page gains a **display mode** (URL-flagged, e.g.
  `?display=1`): the same page with admin form and merged log hidden and
  attention/fleet/GitHub enlarged for across-the-desk reading on the third
  monitor. This supersedes the earlier separate-page rule; `board.html`
  (which shipped briefly) is removed.
- **Live agent tracking**: the harness feed today emits only `turn.ended`, so
  nobody can know an agent is *currently running*. The feed gains a
  **`turn.start`** event (with a `turnId` echoed by `turn.ended`), and the
  status-monitor projection derives **running agents per machine** — agents
  executing within repositories right now — rendered per source on the
  primary page.
- **Deliberately deferred** (candidate follow-up changes): awaiting-input /
  current-task / context-window % signals, usage/burn-rate panel, acting on
  items from the board data (the status rendering stays read-only).

## Capabilities

### New Capabilities
- `status-monitor`: the fleet mission-control rendering on the events-app
  primary page — attention queue, per-machine status with running agents,
  GitHub repo/PR/CI panel, and the zero-interaction display mode.

### Modified Capabilities
- `harness-event-feed`: emits `turn.start` at the turn-launch boundary, and
  `turn.ended` additionally carries the pairing `turnId`.

## Impact

- **New:** `GET api/status-monitor/board` aggregation endpoint +
  `GitHubStatusService`; attention/fleet/GitHub sections and display mode in
  `events-app/index.html`. The events-app's identity intentionally widens
  from "feed viewer" to "fleet mission control".
- **Modified:** `CliRunnerService` publishes `turn.start` (same best-effort
  chokepoint contract as `turn.ended`); `turn.ended` payload gains `turnId`.
- **Read (unchanged):** event-feed-collector's source/status model;
  github-credentials for API auth.
- **External:** GitHub REST API polling via `gh` (rate limits respected; PAT
  stays inside `gh`).
- **Compat:** fleet machines running older harness builds emit no
  `turn.start`; their cards simply show no running agents (never an error).
