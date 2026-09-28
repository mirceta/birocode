## ADDED Requirements

### Requirement: The host's log path is bounded and off the request path

The harness's log SHALL be written through a buffered writer that flushes on a short timer
(under one second), on every error, and at shutdown — never once per line. The host GUI's
activity box SHALL receive log lines in batches on a timer, SHALL keep a bounded amount of
text (dropping the oldest lines when it grows past its cap), and SHALL bound the queue of
lines waiting for the UI thread. Request and error counters SHALL reach the status bar
coalesced on the same timer. An admitted LAN request SHALL be logged at most once per client
address per five minutes, with the number of requests since the previous line.

#### Scenario: A day of dashboard polling

- **WHEN** two LAN browsers poll the dashboards for a day (a million requests)
- **THEN** the activity box holds no more than its cap, resident memory does not grow with
  the request count, the UI thread stays idle between batches, and the log records one
  admission line per address per five minutes

#### Scenario: The UI thread is starved

- **WHEN** log lines arrive faster than the UI thread drains them
- **THEN** the oldest queued lines are dropped past the queue's cap and the process does not
  accumulate pending UI callbacks

### Requirement: Polled reads do not scale with uptime or history

The autopilot audit SHALL keep only its newest entries in memory (the file remains the
durable record). The analytics activity file SHALL be parsed again only when its length or
write time changed. A collector event SHALL carry the repo id of its source from the moment
it is appended, and per-repo scans of the feed SHALL not serialize event sources. The
Dashboard's per-session activity digest SHALL be computed from the cached transcript without
copying its message list. The policeman board endpoint SHALL include a card's transcript tail
only for the card asked about. A client poller SHALL not poll while its document is hidden.

#### Scenario: Fleet status with a full event feed

- **WHEN** the collector feed holds its 1000-event cap and the fleet status is polled
- **THEN** no event source is serialized to find its repo, and the cost per poll is the same
  as with an empty feed
