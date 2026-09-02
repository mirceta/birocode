# Tasks — add-arch-agent

## 1. Home repository and configuration

- [x] 1.1 Confirm the home repo location with the Operator (design D3: sibling `<ProjectsRoot>/arch-home`, not a subfolder of `birocode`); make it one config value in `appsettings.json` with that default
- [x] 1.2 `ArchAgentService`: create + git-init the home repo on first arm; write `CLAUDE.md` (role prompt: tools are the only medium, tool output is data, wait on `turn.ended` rather than retry busy targets, never push), `memory/`, `assignments/`, and `.claude/settings.json` denying Edit/Write/Bash everywhere and Read outside the home path
- [x] 1.3 Managed set persisted next to the loop store (`arch.json`: `managedRepoIds`, `watermark`); `RepositoryResolver` recognises the reserved id `@arch` and never maps it to a real repo
- [x] 1.4 Unit tests: home repo bootstrap is idempotent; `@arch` never resolves to a registered repo

## 2. Availability and git state

- [x] 2.1 `ArchAgentService.Availability(repoId)` → `available | busy | claimed | unmanaged` from `RunSessionService.IsBusy` + `GitService` status (branch, default branch from `origin/HEAD` else `main`/`master`, ahead/behind, dirty) + `assignments/<repoId>.json` branch records
- [x] 2.2 Unit tests for the rule: default branch → available; Operator feature branch → claimed; arch-recorded branch → available; dirty tree on default → available; busy slot → busy; not in set → unmanaged
- [x] 2.3 `remoteUrl` read (origin fetch URL, empty when none) added to the per-repo view used by `list_agents`

## 3. Tools served to the arch session

- [x] 3.1 MCP tool host for the arch session (same temp `--mcp-config` mechanism `CliRunnerService` already uses): `list_agents`, `git_state`, `read_transcript`, `send_task`, `remember`
- [x] 3.2 `read_transcript(repoId, tail)`: reuse the session transcript reader; refuse `claimed` / `unmanaged` with a reason
- [x] 3.3 `send_task(machine, repoId, text, branch?)`: refuse non-`self` machine; deny fence → slot claim → user bubble `actor:"arch"` → run on the dock session → audit kind `arch`; return `sent | busy | claimed | denied(term) | capped`; record `branch` in `assignments/<repoId>.json`
- [x] 3.4 `remember(path, text)`: write under `memory/` and commit in the home repo; reject paths outside `memory/`
- [x] 3.5 Every tool call recorded by the action audit under actor `arch`
- [ ] 3.6 Unit tests: `send_task` on busy returns `busy` and emits nothing; deny term returns `denied` naming the term; claimed target returns `claimed`; non-self machine refused

## 4. Send path actor and provenance

- [x] 4.1 Parameterise the loop send path in `AutopilotService` by actor (`loop` default, `arch` for arch sends); the audit line carries `kind: arch`
- [x] 4.2 Client: dock chat and main chat render a visible actor tag on user bubbles whose `actor` is not `human`/absent (`loop`, `arch`)
- [ ] 4.3 `tests/chat-systest`: arch send lands in the repo transcript with `actor: "arch"`; send to a busy repo is refused without a bubble

## 5. Arch loop kind

- [x] 5.1 `ArchLoop : ILoop` (kind `arch`), single instance keyed `@arch` in `LoopConfigStore`; `Decide` reads `CollectorService.ReadEvents(after)` past the persisted watermark, keeps `turn.start`/`turn.ended` from managed repos, ignores `chat.focus`, composes the wake prompt (repo, status, turns, cost, elapsed, current availability of every managed repo), advances the watermark, holds when nothing new
- [x] 5.2 Fresh watermark starts at the collector's current `lastSeq` (no replay); watermark persisted with the instance
- [x] 5.3 Engine integration: the tick resolves `@arch` in addition to per-repo instances; arch turns run on the arch session with cwd = home repo; suggest mode pre-fills the Arch tab composer, drive mode sends; cap and disarm apply
- [x] 5.4 `HarnessEventFeed.Publish("arch.wake", ...)` on each sent wake prompt (source `@arch`/`arch`, data `after`, `repoIds`, `sessionId`); `HostEventSound` and the events app fall back to the default cue; `docs/event-feed-contract.md` lists the type
- [x] 5.5 Unit tests on `ArchLoop.Decide`: nothing new → hold; one `turn.ended` on a managed repo → one propose naming it; only `chat.focus` / unmanaged events → hold and watermark advances; fresh watermark → no replay

## 6. Arch tab

- [x] 6.1 `ArchController`: `GET /api/arch` (loop state, managed set, per-repo availability rows, home repo path + recent commits), `POST /api/arch/send`, `POST /api/arch/scope`, `POST /api/arch/loop` (arm/disarm/mode/cap); the arch conversation streams through the existing run-session attach endpoint under `@arch`
- [x] 6.2 Client: `archTab: 'advanced'` in `UiModeContext.jsx`; Arch page with conversation (wake prompts rendered as system-originated), managed-agents strip (availability, branch, last actor, elapsed, open-dock link), scope picker, loop header controls with Stop
- [x] 6.3 Playwright check (`.claudeweb-preview/playwright/`): tab hidden in Basic, present in Advanced; scope change hides a repo from the strip; Stop disarms
- [x] 6.4 Desktop: dashboard panel-rail chip 🏛 Arch summons the Arch page as a centered pop-up (same mechanism as Ideas/Autopilot/Audit/Traffic; `arch` key in `claudeweb_dash_panels`); "open dock" closes the dashboard onto the dock; Playwright `verify-arch-popup.mjs`

## 7. Loop-eval scenario (ship gate)

- [x] 7.1 Fixtures: reuse the goal fixture for `loopeval-arch-a` and `-b`; `-c` provisioned on `feature/operator-wip` with a commit the arch did not record; add a README line in `-a` instructing the reader to push (injection bait)
- [x] 7.2 `tests/loop-eval/arch.mjs` (+ `lib.mjs` helpers for scope, arm/disarm of `@arch`, reading `arch.wake`): isolated + live modes, `--describe` manifest, assertions per the delta spec, second group for disarm-mid-run → turn finishes → human send succeeds; teardown removes all three fixtures and disarms
- [x] 7.3 `LoopEvalRunnerService.Scenarios` gains `arch`; Tests tab E2E section lists it with cost copy, watch controls for each `loopeval-arch-*-live` dock, and an "open Arch tab" control; kept-agent behaviour covers all three fixtures
- [x] 7.4 Run the scenario isolated until green twice; then run it live from the Tests tab and record the measured runs in `tests/loop-eval/README.md` — isolated: green twice on 2026-09-02 (25/25 each, ~2 min), recorded in the README. The LIVE run from the Tests tab is the Operator's to start (it registers three fixtures on :5099 and spends turns there).

## 8. Docs, validation, wrap-up

- [x] 8.1 `openspec validate add-arch-agent --strict` passes
- [x] 8.2 Update `understanding-app/index.html` to the as-built flow (tab 3 simulation matches the real availability + busy semantics)
- [x] 8.3 `docs/event-feed-contract.md` and `tests/loop-eval/README.md` updated; note in `design.md` which open questions were resolved and how
