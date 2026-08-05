# autopilot-loops — delta

Fixes the spurious `escalate · step-unverified` from the first live queue-loop
verification (2026-07-31): the no-reply retry path re-judged the previous
step's reply as the verification verdict after the CLI streamed — but never
persisted — the real `STEP_VERIFIED` reply.

## ADDED Requirements

### Requirement: A drive loop only judges replies newer than its last send

The engine SHALL, for a driven loop in drive mode that has sent at least once
this arming, treat the pinned session's trailing assistant message as the reply
to the last send only when its timestamp is newer than the loop's last-send
timestamp. Text that predates the send SHALL never reach the kind's decision as
the reply — in particular, a verify-phase judgment SHALL never fire against it.
Textual (snippet) comparison SHALL not be used to decide reply freshness.

#### Scenario: Stale step reply is not judged as the verification verdict

- **WHEN** a queue loop's verification send completes while the transcript's trailing assistant message is still the previous step's reply
- **THEN** the loop does not escalate `step-unverified` against that stale text; it proceeds via the witnessed reply or the no-reply path

### Requirement: The engine judges the streamed reply when the transcript loses it

The engine SHALL, when the transcript holds no assistant reply newer than the
loop's last send but the completed builder-lane run streamed visible reply
text after that send, use that streamed text as the agent's reply for the kind's
decision, logging that the transcript fallback was taken. The durable
transcript SHALL remain the preferred source whenever it holds a fresh reply.

#### Scenario: Unpersisted STEP_VERIFIED still advances the queue

- **WHEN** a queue verification run streams a reply ending `STEP_VERIFIED` but the CLI never writes it to the transcript
- **THEN** the loop treats the step as verified and unloads the next queue item instead of stalling or escalating

#### Scenario: Unpersisted failed verification escalates with the real text

- **WHEN** a queue verification run streams a reply that does not end `STEP_VERIFIED` and the CLI never persists it
- **THEN** the loop escalates `step-unverified` quoting the streamed verification reply, not older text

### Requirement: A missing reply re-sends the awaited prompt, never a judgment

The kind SHALL decide with no reply text when neither the transcript nor the
run buffer holds a reply newer than the last send. A queue or goal loop in
its verify phase SHALL then re-propose its verification prompt and remain in
the verify phase. The no-reply ladder is unchanged: one grace tick, bounded
retries that count as normal sends, and after the configured consecutive
misses the loop SHALL resolve `error` with stop reason `no-reply`.

#### Scenario: Reply-less verification run retries the verification prompt

- **WHEN** a verification send's run completes with no reply visible in either source
- **THEN** the next decide re-sends the verification prompt (verify phase kept) instead of judging absent text

#### Scenario: Persistent reply loss ends honestly

- **WHEN** consecutive runs beyond the retry bound produce no witnessed or persisted reply
- **THEN** the loop resolves `error` / `no-reply` rather than escalating with quoted stale text

### Requirement: Synthetic transcript repairs are not agent replies

The loop's pinned transcript read SHALL skip assistant messages whose model is
the CLI's synthetic marker (`<synthetic>`, e.g. the "No response requested."
resume repair) when selecting the trailing assistant message, so a repair line
SHALL never be judged as a reply regardless of its timestamp.

#### Scenario: Repair line cannot fail a verification

- **WHEN** a resume writes a synthetic "No response requested." line after a verification send whose real reply was only streamed
- **THEN** the loop judges the streamed verification reply and the synthetic line is ignored
