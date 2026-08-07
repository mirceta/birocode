## MODIFIED Requirements

### Requirement: Strict IP gate is preserved for unapproved devices

The system SHALL reject any request whose client IP is not on the allowlist and which carries no
valid trusted-device cookie, returning the existing `403` standalone rejection page before the
static, SPA, or password layers are reached. There SHALL be no fall-through to the login screen
for such requests, so an unapproved visitor cannot reach or attempt the password.

The sole exception SHALL be the shared-ideas hub contract path (`GET`/`POST`
`/api/notes/hub/{token}`, segment-matched so `/api/notes/hub-info` stays gated): it SHALL be
served to any IP, because its embedded 256-bit token is the credential (same bearer-capability
trust model as an Apps Script `/exec` URL) and remote harnesses sync from addresses the Operator
never sees. This exception SHALL grant access to nothing beyond the hub contract handlers — a
wrong or absent token still answers only the `{ok:false, error}` envelope, and no other path
gains the bypass.

#### Scenario: Unknown visitor is rejected outright

- **WHEN** a request arrives from an IP not on the allowlist with no valid trusted-device cookie
- **THEN** it is rejected with `403` and the standalone rejection page, identical to the pre-change behaviour, and the password endpoint is never reached

#### Scenario: Unapproved IP reaches the hub path only

- **WHEN** a request from an IP not on the allowlist, with no trusted-device cookie, targets `GET` or `POST` `/api/notes/hub/{token}`
- **THEN** it bypasses the IP gate and is answered by the hub contract handler (token still decides between board data and the error envelope), while a simultaneous request from the same IP to any other path — including `/api/notes/hub-info` — is rejected with `403`
