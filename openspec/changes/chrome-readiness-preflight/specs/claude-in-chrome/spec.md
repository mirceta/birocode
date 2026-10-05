## ADDED Requirements

### Requirement: Claude for Chrome readiness preflight

The harness SHALL report whether this machine can give a repo agent the browser as one overall
state — ready, degraded or not ready — and a list of checks, each with a state (pass, fail,
warning, cannot-be-checked, or nothing-to-judge-yet), the concrete reason, and what to do when it
is not a pass. The checks SHALL cover the actual chain: Chrome installed and running; the Claude
extension installed, enabled and at least version 1.0.36, and in which Chrome profile; the
native-messaging registration down to the program it starts; the bridge pipe the extension's
native host opens; the Claude Code CLI and its `--chrome` support; that Claude Code uses its
claude.ai login with no other authentication source that an agent turn would inherit; the
harness's own browser gate; and what real agent browser calls on this harness last answered.
What cannot be determined from the harness — the account the extension is signed in to — SHALL
be reported as cannot-be-checked and never as a pass, until a live answer from the extension
proves it. The overall state SHALL be ready only when no check fails or warns AND a live proof
exists; with every static check passing and no proof it SHALL be degraded.

#### Scenario: Everything installed, nothing proven

- **WHEN** Chrome, the extension, the registration, the bridge, the CLI and the login all check
  out and neither the live probe nor a real agent browser call has answered yet
- **THEN** the overall state is degraded, the extension's sign-in is shown as cannot-be-checked,
  and the live-probe check says how to run it

#### Scenario: The bridge is down

- **WHEN** Chrome is open without the extension's native host running
- **THEN** the bridge check fails, says an agent's browser call fails right now with "Browser
  extension is not connected", and says to open the profile that has the extension

#### Scenario: Another authentication source reaches the agent turn

- **WHEN** the harness process has a long-lived Claude token or another authentication override
  in its environment that agent turns inherit
- **THEN** the login check fails, names the variable, explains that Claude Code then keeps Chrome
  integration off even with `--chrome`, and says to remove it and restart the harness

#### Scenario: A real agent call failed

- **WHEN** the newest connection-class result of a real agent browser call is "Browser extension
  is not connected"
- **THEN** the last-call check fails with the tool, the age and the extension's own words

### Requirement: The preflight never starts a process when polled, and its live probe is an explicit act

The polled preflight read SHALL answer from a cached snapshot and SHALL NOT start any process;
the static facts SHALL be re-read at most every thirty seconds by one background pass that reads
only the registry, files, the process list and the pipe list. A live probe SHALL run only when
the Operator asks for a re-run: one short agent turn started the way an agent's browser turn is
(the same CLI, `--chrome`, the same environment handling), allowed two read-only browser tools,
opening no tab and writing no session file, holding the browser gate while it runs. The probe's
verdict SHALL come from the turn's tool results — whether the browser tools were offered, which
browsers answered, whether the extension answered — and not from the model's text. A probe SHALL
be refused, with the reason, while a real browser turn holds the browser.

#### Scenario: Re-run on a healthy machine

- **WHEN** the Operator presses Re-run and the chain is intact
- **THEN** within about half a minute the live-probe check passes naming the connected browser,
  the extension's sign-in check turns to pass, and the overall state is ready

#### Scenario: Re-run when the tools are not offered

- **WHEN** the probe turn starts with `--chrome` but lists no browser tools
- **THEN** the live-probe check fails saying so, with the authentication source the CLI used
