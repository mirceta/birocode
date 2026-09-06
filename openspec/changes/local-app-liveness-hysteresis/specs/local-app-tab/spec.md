## ADDED Requirements

### Requirement: An embedded local app is hidden only when the harness knows it is dead

The embedded local-app frame (the Local tab and the agent docks) SHALL judge liveness
with hysteresis: a probe SHALL count as down only when the harness's own localview
answer says so (`X-ClaudeWeb-Localview: unreachable` on its 502, `no-app` on its 404);
any answer produced by the app itself SHALL count as up; a probe that timed out (8 s) or
could not be sent SHALL change nothing. A live app SHALL be hidden only after three
consecutive down verdicts spanning at least ten seconds since the last good sample, and
SHALL be shown again on the next good sample. An app never seen up SHALL show the empty
state on its first down verdict.

#### Scenario: A slow probe

- **WHEN** the app is up and the liveness probe takes five seconds to answer
- **THEN** the app renders and stays rendered

#### Scenario: A transient proxy failure

- **WHEN** the app is up and two consecutive probes come back as the harness's 502 unreachable
- **THEN** the app stays rendered

#### Scenario: A real outage

- **WHEN** every probe for more than ten seconds comes back as the harness's 502 unreachable
- **THEN** the empty state shows, and the app returns on the next probe the app answers
