## ADDED Requirements

### Requirement: Distinguish why a source's pull was rejected

When a watched harness answers a pull but refuses it, the collector SHALL distinguish the cause in the source's surfaced status instead of reporting one generic authorization state. Specifically: an HTTP **403** SHALL surface as **blocked by the harness's IP gate** (status `ip-blocked`), including the collector's rejected IP in the detail when the response body carries it; an HTTP **401 with no credential stored** for the source SHALL surface as **requires a credential** (status `needs-credential`); an HTTP **401 with a credential stored** SHALL surface as **credential rejected** (status `bad-credential`); an HTTP **429** SHALL surface as **throttled**, not as any of the above. All of these are "alive" states (the host answered) and SHALL NOT be presented as the source being dead or unreachable. The same distinction SHALL apply on the immediate probe after registering a source, so the first status the operator sees already names the actual problem. The events app SHALL present these statuses with visibly distinct labels. Credential values SHALL never appear in any status detail.

#### Scenario: Blocked by the IP gate is named, not mistaken for a credential problem

- **WHEN** a registered source's harness answers a pull with HTTP 403 from its IP allowlist gate
- **THEN** the source's status is `ip-blocked` with a detail naming the block (and the rejected IP when the 403 body carries it), and the UI does not suggest supplying a credential

#### Scenario: Missing credential is reported as such

- **WHEN** a registered source with no stored credential is answered with HTTP 401
- **THEN** the source's status is `needs-credential` with a detail saying the harness requires a credential

#### Scenario: Wrong credential is reported as rejected

- **WHEN** a registered source with a stored credential is answered with HTTP 401
- **THEN** the source's status is `bad-credential` with a detail saying the credential was rejected, so the operator knows to re-enter it rather than wonder whether one is needed

#### Scenario: Throttling is not conflated with authorization

- **WHEN** a registered source's harness answers a pull with HTTP 429
- **THEN** the source's status reflects throttling with the response's retry detail when present, and is not reported as needing or rejecting a credential

#### Scenario: The add-time probe already distinguishes the cause

- **WHEN** an operator registers a source and the immediate probe is refused with 403 or 401
- **THEN** the source view returned by the add already carries the distinguished status (`ip-blocked`, `needs-credential`, or `bad-credential`), not a generic authorization state
