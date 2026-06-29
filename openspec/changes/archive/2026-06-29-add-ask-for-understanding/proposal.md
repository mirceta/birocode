# Add an "Ask for understanding" agent button to the agent dock

## Why

The agent dock already has one agentic button — **Discover local apps** (openspec
`discover-local-apps`): a read-only Claude Monitor run that scans the dock's repo and
returns a typed result, with progress visible in the per-repo **Console** lane. It proved
the pattern: a button in the dock kicks off a backend-owned Claude Monitor job, scoped to
that dock's repo, observable in the Console.

We now want a **second, more advanced** agentic button next to it. When the user reads a
reply in a dock's conversation, they routinely follow up with "clarify that in the
Understanding app — with demos, diagrams, and a thorough visual explanation" (the repo's
**Understanding-app convention**, `docs/understanding-app-convention.md`). Today that costs
a full extra turn in the live conversation. We want it on **one button press**: take the
dock conversation **as it stands at press time**, hand it to a Claude Monitor agent, and
have that agent **continue the conversation** by building the Understanding app that
visually explains the assistant's most recent turn.

Unlike Discover (read-only, typed-JSON output), this run **writes files** — it authors the
repo's `understanding-app/`. That is the new, more-advanced capability this change adds.

## What Changes

- **New "Ask for understanding" button in the agent dock** — rendered next to
  **Discover local apps** in `PinnedAgent.jsx`, gated on a new UI-mode capability that
  defaults to **Advanced**. Enabled only when the dock's builder lane has a conversation
  (a `sessionId`); otherwise disabled with a hint to start a conversation first.
- **Fork the current conversation into Claude Monitor (do not disturb the live one)** —
  on click, the harness resolves the dock conversation's transcript on disk
  (`~/.claude/projects/<encoded-repo-path>/<sessionId>.jsonl`) and continues it through
  Claude Monitor's **snapshot-resume** endpoint (`POST /api/claude/snapshot-resume` via the
  reused `ClaudeMonitor.Client`). Snapshot-resume **forks** a fresh session from a copy of
  the transcript taken at press time, so the user's live chat is never resumed, interleaved,
  or blocked — matching the user's intent: "the continuation of our current conversation **at
  that time**."
- **The forked agent builds the Understanding app** — the continuation prompt instructs the
  agent to follow `docs/understanding-app-convention.md` and (over)write
  `understanding-app/index.html` (build-less, self-contained, relative URLs) so it visually
  clarifies the **most recent assistant turn** of the conversation with demos / diagrams /
  thorough visual explanation. The run's working directory is the **repo root**, so the
  output lands where the Local tab's always-on **Understanding** app already serves it.
- **Backend-owned, latest-only, observable run** — mirrors the Discover job model: a per-repo
  background job (its own cancellation token, survives a browser refresh/disconnect),
  start-or-join with latest-only replacement, and a pollable status endpoint the button polls
  at the dock cadence. Progress is emitted as **Console events** (`op="understanding"`,
  phases started / done / error) into the existing per-repo `RepoEventLog`, so it shows up in
  the same **Console** lane the user already checks for Discover.
- **Graceful failure** — if there is no conversation yet, or the Claude Monitor gateway is
  not running on `localhost:5123`, the run reports a friendly error event (same pattern as
  Discover) rather than failing silently.
- **i18n** — new label/aria/status strings for the button and its running/done/error states.

## Impact

- **Specs:** adds a new capability `ask-for-understanding` (the dock trigger, the fork via
  snapshot-resume, the Understanding-app output, the backend-owned observable run). Touches
  `agent-dock` only insofar as a sibling button is added — captured in the new capability to
  avoid fragmenting.
- **Code (frontend):** `client/src/components/dashboard/PinnedAgent.jsx` (button + handler +
  status polling), `client/src/context/UiModeContext.jsx` (new `understandingAgent`
  capability, Advanced), the i18n catalog. Console rendering is **reused unchanged**
  (`EventConsole.jsx` already renders any `op`).
- **Code (backend):** a new controller (e.g. `UnderstandingController` with
  `POST /api/understanding/ask` + `GET /api/understanding/status`), a new per-repo job
  registry modeled on `LocalAppDiscoveryJobs`, and a service that resolves the transcript
  path and calls `ClaudeMonitorClient.ResumeFromSnapshot(snapshotPath, prompt,
  workingDirectory)`. DI registration alongside the existing StructuredAsk module. Reuses
  `RepoEventLog` for Console events and `SessionService.ProjectsDirectoryFor` for the
  transcript path.
- **Claude Monitor:** uses the **existing** `/api/claude/snapshot-resume` endpoint and the
  already-referenced `ClaudeMonitor.Client` — no change to the birokrat-ai-platform project.
- **Non-goals:** not a typed-JSON structured ask (this run writes files, it does not return a
  validated report); does not resume or modify the user's live session; does not auto-open or
  navigate to the Understanding app (the user views it in the Local tab as today); no new
  Console component; no change to Discover.
