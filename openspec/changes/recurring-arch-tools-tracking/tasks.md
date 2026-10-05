## 1. One command path

- [x] 1.1 `RecurringCommands` (create / edit / pause / resume / delete, the validation, the
      gate rule per kind); `RecurringController` delegates to it.
- [x] 1.2 `RecurringTask.Kind` (`prompt` | `tracking`), `Description`, `AppId`; a store written
      before the field reads as `prompt`.

## 2. Tracking-only kind

- [x] 2.1 Engine: a tracking card is never ticked, held or run (Run now refused 409); the board
      view carries `kind` / `description` / `appId`, no schedule, no runs, never redacted.
- [x] 2.2 Tab: a second composer button, the tracking editor (title, agent, description, local
      app — picker from `/api/repos` for this machine's agents, free text for a peer's), the
      distinct card with **Open harness** (`focusAgentTab` + `agentWorkerHref`) and the optional
      app link (`appHref`: `<harness>/api/localview/<repo>/app/<app>/`), no strip / next / history.
- [x] 2.3 `recurringCards.js` tests for the new pure parts.

## 3. Arch tools

- [x] 3.1 `ArchAgentService.Recurring.cs`: `list_recurring`, `recurring_runs`, `create_recurring`,
      `update_recurring`, `delete_recurring` — resolve the agent like the loop tools, scope =
      managed agents, audit per call, `RecurringCommands` for every mutation; the engine reached
      lazily (the arch is its port).
- [x] 3.2 `ArchMcpServer` catalogue entries; role prompt "## Recurring tasks" (marker v16).
- [x] 3.3 `RecurringCommandsTests` (kinds, validation, gate per kind, scheduler never touches a
      tracking card, board view, edit/pause/resume/delete, the catalogue and the role prompt).

## 4. Verify

- [x] 4.1 .NET + client suites green; Management App bundle rebuilt.
- [x] 4.2 `client/tests/ui/shot-recurring-tracking.mjs`: both kinds render, the tracking card is
      distinct, Open harness opens the agent's named tab with the deep link and re-focuses it
      without a second tab, the app link is the localview path (self + peer), the composer
      offers both kinds and validates the tracking form; screenshots for the PR.
