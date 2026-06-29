# Tasks

## 1. Backend — Claude Monitor continuation service

- [x] 1.1 Add a service that, given a repo path + builder `sessionId`, resolves the transcript
      path via `SessionService.ProjectsDirectoryFor(repoPath)` + `<sessionId>.jsonl`, builds
      the understanding continuation prompt (read `docs/understanding-app-convention.md`,
      focus on the latest assistant turn, overwrite `understanding-app/`, build-less +
      relative URLs), and calls `ClaudeMonitorClient.ResumeFromSnapshot(snapshotPath, prompt,
      workingDirectory: repoPath)`. Per **Option A**, the fork runs with the CLI's default
      toolset (snapshot-resume carries no `AllowedTools`); writes are bounded by working dir =
      repo root and the prompt scoping output to `understanding-app/`. No Claude Monitor change.
- [x] 1.2 Handle gateway-unavailable and missing-transcript as friendly failures (mirror
      `StructuredAskRunner`'s gateway-down message).

## 2. Backend — per-repo job registry + controller

- [x] 2.1 Add an `UnderstandingJobs` registry modeled on `LocalAppDiscoveryJobs`:
      `StartOrJoin(repoId, repoPath, sessionId)` runs the service on a background `Task` with
      its **own** `CancellationToken` (survives request abort), latest-only replacement, and a
      pollable job state.
- [x] 2.2 Emit `RepoEventLog` events `op="understanding"` with phases `started` / `done` /
      `error` (title + human-readable detail) so the run shows in the Console lane.
- [x] 2.3 Add `UnderstandingController`: `POST /api/understanding/ask` (start-or-join, scoped
      by `X-Repo-Id`, body carries `sessionId`) and `GET /api/understanding/status` (reattach
      only, never starts). Return a shared status projection `{ status, error?, startedAt?,
      finishedAt? }`.
- [x] 2.4 Register the new services in DI alongside the StructuredAsk module.

## 3. Frontend — capability, button, polling

- [x] 3.1 Add an `understandingAgent` capability to `client/src/context/UiModeContext.jsx`,
      defaulting to `'advanced'`.
- [x] 3.2 In `PinnedAgent.jsx`, render an **Ask for understanding** button next to the
      Discover button, gated on `understandingAgent`, disabled when `tab.sessionId` is absent.
- [x] 3.3 On click, `POST /understanding/ask` with `{ sessionId: tab.sessionId }` (X-Repo-Id =
      tab.repoId); on mount/repo-change reattach via `GET /understanding/status`; poll status
      at the dock cadence until terminal; reflect running/done/error in the button.
- [x] 3.4 Add i18n strings: button label, asking/done/error states, and the
      "start a conversation first" disabled hint.

## 4. Verify + ship

- [x] 4.1 Build the Understanding app for THIS feature at `understanding-app/index.html`
      (per `docs/understanding-app-convention.md`) — it is non-trivial, so visualize the
      click → fork → snapshot-resume → Understanding-app → Console flow.
- [x] 4.2 `npm --prefix client run build` clean; backend builds clean.
- [x] 4.3 Browser-verify (Playwright, `docs/claude-web/browser-testing.md`): with the gateway
      running, press the button in a dock that has a conversation, confirm a `understanding`
      job appears in the Console, completes, and `understanding-app/index.html` is
      (re)written; confirm the live conversation is untouched. Verify disabled state with no
      conversation and the gateway-down error path.
- [x] 4.4 Deploy to live `:5099` via `swap.ps1`, re-verify, then `keep.ps1`.
