# codex-credentials — delta for codex-real-run

## ADDED Requirements

### Requirement: Report the Codex CLI login the codex provider runs as

The system SHALL provide a read-only endpoint `GET /api/codex-account` returning
`{ codexInstalled, authenticated, method?, version?, home, error? }`, derived from the
Codex CLI itself (`codex --version` and `codex login status`, exit 0 meaning logged in)
as the user the harness runs as, memoised for about a minute. `home` SHALL be the
directory Codex reads its credential from for this harness process (`CODEX_HOME` when
set, else the user profile's `.codex`). The endpoint SHALL never read, return or log the
credential itself, and SHALL always answer 200 — "not installed" and "not logged in" are
statuses.

#### Scenario: CLI installed, nobody logged in

- **WHEN** codex-cli is on PATH and `codex login status` prints "Not logged in" with exit 1
- **THEN** the endpoint answers `codexInstalled: true, authenticated: false` with the version and the home directory

#### Scenario: Logged in

- **WHEN** `codex login status` exits 0 and prints how the login was made
- **THEN** the endpoint answers `authenticated: true` with that line as `method`

### Requirement: Establish the Codex CLI login from a pasted API key

The system SHALL provide a write-only endpoint `POST /api/codex-credentials` that accepts
an OpenAI API key in the request body and establishes it as the Codex CLI's login by
passing it to `codex login --with-api-key` over the child process's **stdin** (never as a
command-line argument or environment variable), so that Codex stores it in its own
`auth.json` under the home reported by `GET /api/codex-account` and every codex-engine
turn picks it up from there without a code change. The endpoint SHALL return a typed
result `{ ok, method?, home, error? }` in which `method` is **re-derived by re-probing**
`codex login status`, never reflected from the input; the submitted key SHALL NOT appear
in the response or in any log line, including error text echoed by the CLI. The
dashboard's Codex chip SHALL offer a write-only field for the key (behind the
`codexKeyControl` capability) that is never pre-filled and is cleared on submit.

#### Scenario: Valid key logs the CLI in

- **WHEN** a client POSTs a valid key
- **THEN** the endpoint pipes it to `codex login --with-api-key`, re-probes, and answers `{ ok: true, method: "Logged in using an API key", home: <dir> }`

#### Scenario: Rejected key

- **WHEN** the CLI exits non-zero
- **THEN** the endpoint answers `{ ok: false, error: <first stderr line with the key scrubbed> }` and nothing is logged in

#### Scenario: CLI missing

- **WHEN** codex is not on PATH
- **THEN** the endpoint answers `{ ok: false, error: "codex not found on PATH" }`
