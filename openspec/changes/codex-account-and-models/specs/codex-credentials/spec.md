# codex-credentials — delta for codex-account-and-models

## MODIFIED Requirements

### Requirement: Report the Codex CLI login the codex provider runs as

The system SHALL provide a read-only endpoint `GET /api/codex-account` returning
`{ codexInstalled, authenticated, method?, version?, home, error? }` plus, when
authenticated, the login's identity — `account` (email), `name`, `plan` (a label),
`planType` (the raw slug), `subscriptionUntil`, `authProvider` — derived from the claims
of the id token the Codex CLI stores in `auth.json` (claims only; the token values are
never read out, returned or logged). It SHALL be memoised for about a minute; `home` is
the directory Codex reads its credential from for this harness process. The endpoint SHALL
always answer 200 — "not installed" and "not logged in" are statuses.

#### Scenario: Logged in with a ChatGPT plan

- **WHEN** `codex login status` exits 0 and `auth.json` holds a ChatGPT id token
- **THEN** the endpoint answers `authenticated: true` with the account email, display name, plan label and subscription end from the token claims, and no token value anywhere in the response

#### Scenario: Not logged in

- **WHEN** `codex login status` reports not logged in
- **THEN** the endpoint answers `authenticated: false` with the version and home, and no identity fields

### Requirement: Report Codex plan usage

The system SHALL provide a read-only endpoint `GET /api/codex-usage` returning the ChatGPT
plan's live usage — `{ available, stale, session?, weekly?, scopedWeekly[], plan?, credits?,
limitReached, models[] }` — fetched from the ChatGPT backend usage endpoint using the
stored OAuth access token as a bearer credential only (read into a local, sent, discarded;
never a field, a log line or part of any response). Rate-limit windows SHALL be mapped by
length (about 5 hours → session, about 7 days → weekly, otherwise a labelled scoped row);
per-model limits SHALL become labelled scoped rows; `models` SHALL list the model slugs the
account may actually run (the available entries of `model_usage`). It SHALL be memoised for
minutes with a single-flight refresh and a stale last-good fallback, and degrade to
`available: false` on any failure — never an exception.

#### Scenario: Usage available

- **WHEN** the usage endpoint returns the plan's rate-limit windows and model_usage
- **THEN** `GET /api/codex-usage` reports `available: true` with the mapped session/weekly/scoped rows, credits, and the available model slugs, and no token value in the payload

#### Scenario: Usage unavailable

- **WHEN** the token is missing or the endpoint fails
- **THEN** the endpoint reports `available: false` with a reason, serving the last good result marked `stale` when there was one
