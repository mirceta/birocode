# github-credentials Specification

## Purpose

Let the Operator establish the box's **global, host-keyed** GitHub credential from a
pasted Personal Access Token, entirely in-app, so one token serves both the GitHub API
and `git push`. The token is handled as a secret: piped to `gh` over stdin, never
echoed, logged, or persisted in plaintext by the Harness. This sets the auth/push
identity only — never the commit-author identity.

## Requirements

### Requirement: Establish a global GitHub credential from a pasted token

The system SHALL provide a write-only endpoint `POST /api/github-credentials` that
accepts a GitHub Personal Access Token in the request body and establishes it as the
box's **global, host-keyed** GitHub credential so that both the GitHub API and
`git push` over HTTPS authenticate with it. The endpoint SHALL pass the token to the
`gh` CLI via the child process's **stdin** (never as a command-line argument or
environment variable) using `gh auth login --with-token`, and on success SHALL run
`gh auth setup-git` so git uses gh as its credential helper. The endpoint SHALL return
a typed result `{ ok, host?, account?, error? }` in which `account` is **re-derived by
re-probing** the now-authenticated identity, never reflected from the submitted token.
The submitted token SHALL NOT appear in the response.

#### Scenario: Valid token establishes credential

- **WHEN** a client POSTs a valid token to `/api/github-credentials`
- **THEN** the endpoint logs the token into `gh`, wires it into git via
  `gh auth setup-git`, and responds `{ ok: true, host: "github.com", account: <login> }`
  with the account re-derived from a fresh probe

#### Scenario: gh not installed

- **WHEN** `gh` is not installed / not on PATH
- **THEN** the endpoint responds with `ok: false` and an error indicating gh is not
  available, without throwing

#### Scenario: Invalid or rejected token

- **WHEN** the submitted token is empty or `gh` rejects it
- **THEN** the endpoint responds `ok: false` with a scrubbed error reason and does not
  establish a credential

### Requirement: The token is never exposed, logged, or persisted in plaintext

The system SHALL treat the submitted token as a secret. It SHALL NOT echo the token in
any response, SHALL NOT write the token (or any substring of it) to logs, and SHALL
NOT persist the token in `repositories.json` or any application state in plaintext —
persistence is owned solely by `gh`'s own credential store. Any error text originating
from `gh` SHALL be scrubbed of token-like substrings before it is logged or returned.

#### Scenario: Token absent from responses and logs

- **WHEN** a token is submitted, whether accepted or rejected
- **THEN** neither the response body nor any log line contains the token or a substring
  of it

#### Scenario: No plaintext persistence by the app

- **WHEN** a token is successfully established
- **THEN** the application stores no copy of the token in its own files or state; only
  `gh`'s credential store holds it

### Requirement: Token entry is Advanced-mode and write-only in the UI

The dashboard SHALL provide an **Advanced**-mode control to submit a token to
`POST /api/github-credentials`. The input SHALL be write-only — it SHALL NOT fetch or
display any stored token — and SHALL use a masked field. On success the UI SHALL allow
the existing GitHub account indicator to reflect the newly authenticated account on its
next poll. The control SHALL set only the **auth/push** identity and SHALL NOT change
the commit-author identity (`user.name` / `user.email`).

#### Scenario: Hidden in Basic mode

- **WHEN** the device UI mode is Basic
- **THEN** the token-entry control is not shown

#### Scenario: Write-only masked entry

- **WHEN** the user opens the token control
- **THEN** it presents a masked, empty input that never displays a previously stored
  token, and submitting it clears the field

#### Scenario: Success reflected by the account indicator

- **WHEN** a valid token is submitted and accepted
- **THEN** the GitHub account indicator reflects the authenticated account on its next
  poll, without the commit-author identity changing
