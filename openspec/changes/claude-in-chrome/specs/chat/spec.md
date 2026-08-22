# Chat

## ADDED Requirements

### Requirement: Browser mode for a chat turn

The chat UI SHALL offer a per-device browser-mode toggle (Advanced mode, builder lane
only) that sends the browser flag with each prompt while enabled, and SHALL surface
the integration's availability so a misconfigured host is explained rather than
silent.

#### Scenario: Toggle rides the send

- **WHEN** the End User enables the browser toggle and submits a prompt in the builder lane
- **THEN** the chat request carries the browser flag and the turn runs with the Chrome toolset

#### Scenario: Unavailable integration is explained

- **WHEN** the End User enables the browser toggle on a host where the integration is unavailable
- **THEN** the UI shows why (missing extension host or unsupported CLI) near the toggle

#### Scenario: Busy browser is a clear rejection

- **WHEN** the End User submits a browser-mode prompt while another repo's browser run is active
- **THEN** the chat shows the rejection message naming the busy repo
