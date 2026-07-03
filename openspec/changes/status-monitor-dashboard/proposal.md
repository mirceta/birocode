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
- The board ships as a **sibling page inside the existing events-app**
  (`events-app/board.html`) — the events-app is already the multi-machine
  surface (it renders the collector's sources) and its serving service already
  serves every file in that folder, so the wallboard needs **zero new serving
  code**. It stays a *separate page* from the feed log: the log is
  interactive/chronological, the wallboard is zero-interaction/alert-first —
  one page doing both would do both badly.
- **Deliberately deferred** (each a candidate follow-up change, kept out to
  stay additive): richer per-agent signals in the harness feed
  (awaiting-input, current task, context-window %), usage/burn-rate panel,
  acting on items from the wallboard (it stays read-only).

## Capabilities

### New Capabilities
- `status-monitor`: the glanceable third-monitor wallboard — fleet panel,
  attention queue, GitHub repo/PR/CI panel, wallboard presentation rules.

### Modified Capabilities

None. v1 renders only data the collector and GitHub already provide; enriching
`harness-event-feed` / `event-feed-collector` with per-agent attention signals
is a separate follow-up change so this one stays additive and archives cleanly.

## Impact

- **New:** `events-app/board.html` wallboard page (no new serving service —
  the existing events-app service serves it) + a harness endpoint aggregating
  collector state and GitHub status for it. Accepted trade-off: the
  events-app's identity widens from "feed viewer" to "fleet app", since the
  board page brings GitHub data with it.
- **Read (unchanged):** event-feed-collector's source/status model;
  github-credentials for API auth.
- **External:** GitHub REST API polling (rate limits respected; PAT already on
  the box for `gh`).
- **Ops:** one more always-open browser window on the operator's host; no new
  service, no schema changes to the feed.
