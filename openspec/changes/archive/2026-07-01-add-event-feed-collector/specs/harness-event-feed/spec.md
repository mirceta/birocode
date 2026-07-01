# harness-event-feed

## MODIFIED Requirements

### Requirement: In-repo consumer app observes the collector

The system SHALL include, in this repository, a build-less, self-contained local app that
displays harness events, served through the harness's existing local-app mechanism and
following the local-exposure rules (relative URLs, served under the harness proxy path).
The app SHALL be a **backend observer of the collector** rather than a client-side poller
that owns the listening state: on load it SHALL read the collector's current sources and
the aggregated event stream from the backend and resume rendering the live feed, so that a
page reload does not stop or restart listening. The app SHALL render events **generically
from the envelope** (showing each event's `type`, `source`, time, and payload, plus which
registered source it arrived through), so it still serves as the test bed for future event
types. The app SHALL also let the operator manage sources (add a harness by address,
start/stop, remove), with those controls calling the collector's source-management
endpoints; the credential field SHALL be write-only and never pre-filled from a stored
value.

#### Scenario: Reload resumes the feed without re-starting

- **WHEN** the consumer app is showing the live feed and the page is reloaded
- **THEN** on load it reads the collector's backend state and resumes showing the live
  aggregated feed without the operator pressing start again

#### Scenario: The app shows turn-ended events arriving from a source

- **WHEN** the app is open and an agent turn ends on any collected harness
- **THEN** on its next poll the app displays the corresponding `turn.ended` event with its
  repository, session, status, and the source it came from

#### Scenario: The app renders an unknown event type generically

- **WHEN** an event whose `type` the app does not specifically know about appears in the aggregate
- **THEN** the app still displays it using the common envelope fields rather than ignoring
  it or breaking

#### Scenario: Adding a harness is write-only for the credential

- **WHEN** the operator adds a harness source with a credential through the app
- **THEN** the credential is submitted to the backend and is never displayed back or
  pre-filled by the app
