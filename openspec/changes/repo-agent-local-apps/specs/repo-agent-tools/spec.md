## ADDED Requirements

### Requirement: A repo agent can list, locate and operate its own local apps
The `claude-web` server SHALL offer `my_local_apps(action?, app?)`. With `list` (the default) or
`status` it SHALL return every local app of the agent's repo — each app the Operator registered on
the Local tab (kind `repo`, and the always-on kind `harness` apps) and each app the repo's
discovery cache holds — joined by port, with for each: id, name, kind, whether registered and
whether discovered, port, loopback URL, the Local-tab URL when registered, the absolute folder
inside the repo, the start and build commands and evidence when discovered, when it was
discovered, whether it is listening right now (read live off the port), and a sentence saying
how to run it and how to stop it — including, when something is missing, what is missing and how
to get it. With `start`, `stop` or `restart` and `app` (an id, a name or a port) it SHALL launch
the cached start command detached in the app's folder, or end the process tree of whatever
listens on the port with the harness's self-guard, or do both with a bounded wait for the port to
free — refusing a harness-served app (`always-on`), an app with no known command (`no-command`)
and a start of an app already listening (`already-listening`). Each start / stop SHALL be
recorded in the repo's Event Console and the autopilot audit. The Tools lane SHALL list the tool
with the rest of the catalogue.

#### Scenario: Where is my app
- **WHEN** an agent on repo prg, with "Admin console" registered on port 5300 and a discovery finding for port 5300 in folder `apps/admin` with start command `npm run dev`, calls `my_local_apps`
- **THEN** the answer lists Admin console with folder `<repo>\apps\admin`, port 5300, `http://127.0.0.1:5300/`, the Local-tab URL, `npm run dev`, whether it is listening, and how to run it

#### Scenario: Registered but never discovered
- **WHEN** an app is registered on a port that no finding names
- **THEN** its row has no folder and no command and its how-to-run says to run Discover or import findings

#### Scenario: Start through the harness
- **WHEN** an agent calls `my_local_apps` with action `start` and app `5300`
- **THEN** the harness launches `npm run dev` detached in `apps/admin`, answers `launched` with the pid, and the Event Console shows "Start · Admin console (agent)"

#### Scenario: The harness is never stopped
- **WHEN** a discovered port's listener is the harness itself
- **THEN** `stop` answers `stop-failed` naming the refusal and nothing is ended
