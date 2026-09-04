## ADDED Requirements

### Requirement: No steady-state full-transcript polling

The web UI SHALL NOT fetch a whole session transcript on a recurring timer.
Recency and "what is it doing" for dashboard docks SHALL come from
`POST /api/sessions/activity`, a batch endpoint that returns, per requested
(repo, session), the latest assistant line, the newest user timestamp and the
message count. A conversation's transcript SHALL be fetched at most once per
(conversation, session) while a fetch is in flight — concurrent requests for the
same transcript share the first request.

#### Scenario: Dashboard with six visible docks

- **WHEN** the dashboard overlay polls liveness
- **THEN** it issues one `/api/runs` and one `/api/sessions/activity` request per
  tick, and no `/api/sessions/{id}/messages` request

#### Scenario: Reconcile tick during a slow transcript load

- **WHEN** the 5 s reconcile fires while the first transcript load for a
  reattached conversation is still in flight
- **THEN** no second `/api/sessions/{id}/messages` request is issued for it

### Requirement: Arch page pollers are visibility- and lane-gated

The Arch page's state, transcript, tools and history pollers SHALL skip their
tick while the document is hidden, and the transcript poll SHALL run only while
the Chat lane is shown.

#### Scenario: History lane open on a hidden tab

- **WHEN** the Arch page is on the History lane and the tab is hidden
- **THEN** no `/arch/messages` or `/arch/tool-calls` requests are issued until
  the tab is visible again
