## ADDED Requirements

### Requirement: Hosts the Claude for Chrome readiness section

The status strip SHALL host a Chrome section beside the admin and keep-alive sections, in
Advanced mode: a header with the overall state (ready, degraded, not ready) and how many checks
failed, warn or cannot be checked, expandable into the checks with failures first, each showing
its reason and, when it is not a pass, what to do. The section SHALL carry a Re-run button that
re-reads every check and starts the live probe, SHALL say when the probe could not be started and
why, and SHALL state what cannot be checked from the harness. It SHALL stay current the way the
other sections do — its own five-second poll of a cached endpoint, paused while the tab is hidden
and absent while the strip is collapsed.

#### Scenario: A failing machine

- **WHEN** a check fails
- **THEN** the section's header reads "Not ready" with the number of failures, and the failing
  check is listed first with its reason and what to do

#### Scenario: Collapsed strip

- **WHEN** the status strip is collapsed
- **THEN** the Chrome section is not mounted and makes no request
