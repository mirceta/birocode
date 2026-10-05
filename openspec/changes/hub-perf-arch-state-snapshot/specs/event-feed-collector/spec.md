## ADDED Requirements

### Requirement: An unreachable source is backed off, not re-dialled every pass

The collector SHALL NOT dial a remote source that did not answer (unreachable: refused, host
not found, timed out) again on the very next pass. It SHALL wait 8 s after the first failure
and double the wait on each consecutive failure (16 s, 32 s, 64 s) up to a cap of two minutes,
and SHALL dial again as soon as the wait has elapsed. A successful poll SHALL reset the wait.
The source's view SHALL carry the number of consecutive failed polls and the time of the next
dial. The log SHALL record the failure once per step of the wait (with the next-try time) and
once on recovery ("reachable again after N failed polls"), not once per pass.

#### Scenario: A dead peer costs one dial per backoff step

- **WHEN** a registered source stops answering for an hour
- **THEN** the collector dials it at most 5 times in the first two minutes and then every two
  minutes, the source's view says `unreachable` with the failed-poll count and the next-try
  time, and the log has one line per step and none in between

#### Scenario: A peer that comes back is noticed within the cap

- **WHEN** a backed-off source answers again
- **THEN** its next due dial succeeds, the wait resets to zero, the source is `active`, and the
  log says it is reachable again and how many polls had failed

#### Scenario: Other sources are unaffected

- **WHEN** one source is backed off
- **THEN** the other sources are still polled every pass
