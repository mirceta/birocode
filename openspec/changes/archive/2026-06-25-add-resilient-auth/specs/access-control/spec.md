# Access control

## ADDED Requirements

### Requirement: Strict IP gate is preserved for unapproved devices

The system SHALL reject any request whose client IP is not on the allowlist and which carries no
valid trusted-device cookie, returning the existing `403` standalone rejection page before the
static, SPA, or password layers are reached. There SHALL be no fall-through to the login screen
for such requests, so an unapproved visitor cannot reach or attempt the password.

#### Scenario: Unknown visitor is rejected outright

- **WHEN** a request arrives from an IP not on the allowlist with no valid trusted-device cookie
- **THEN** it is rejected with `403` and the standalone rejection page, identical to the pre-change behaviour, and the password endpoint is never reached

### Requirement: A trusted-device cookie is minted on first admitted entry

The system SHALL issue a trusted-device cookie (`claudeweb_device`) when a request is admitted
from an Operator-approved IP and completes a successful login, so the device that just entered can
be recognised later regardless of its IP. The cookie SHALL be high-entropy, HttpOnly, Secure, and
have a long sliding lifetime, and only its hash SHALL be stored server-side. The system SHALL NOT
issue the cookie to a request that was rejected by the IP gate.

#### Scenario: First approved entry mints the cookie

- **WHEN** the Operator has approved a visitor's IP and that visitor completes a successful login
- **THEN** the server sets a HttpOnly, Secure `claudeweb_device` cookie and stores its hash server-side

#### Scenario: A rejected request never gets a cookie

- **WHEN** a request from an unapproved IP with no valid cookie is `403`'d
- **THEN** no trusted-device cookie is issued

### Requirement: A valid trusted-device cookie bypasses the IP gate

The system SHALL admit a request from an IP that is not on the allowlist when the request carries a
valid, unrevoked trusted-device cookie, so an already-approved device is not re-barred when its IP
changes. On such an admission the system MAY record the new source IP, tagged as originating from a
device cookie, for Operator visibility. The bypass SHALL apply only to the IP gate; the request
SHALL still satisfy the password/session layer for protected `/api/*` routes.

#### Scenario: Approved device on a new IP

- **WHEN** a device holding a valid trusted-device cookie sends a request from an IP not on the allowlist
- **THEN** the request passes the IP gate without Operator action, and protected `/api/*` routes still require a valid session or password

#### Scenario: Revoked or expired cookie does not bypass

- **WHEN** a request from an unapproved IP carries a trusted-device cookie that has been revoked or has expired
- **THEN** the request does not bypass the IP gate and is rejected with `403`

### Requirement: Trusted devices are listable and revocable

The system SHALL store each trusted-device token server-side tagged with a name and issued/last-seen
timestamps, SHALL present them in a "Trusted devices" list in the desktop GUI, and SHALL let the
Operator revoke any device so it can no longer bypass the IP gate. Removing a guest SHALL offer to
revoke that guest's trusted-device tokens, so a removed person cannot continue entering via a cookie.

#### Scenario: Operator revokes a trusted device

- **WHEN** the Operator revokes a trusted device from the GUI
- **THEN** a subsequent request from that device on an unapproved IP is rejected with `403`

#### Scenario: Removing a guest can evict their device

- **WHEN** the Operator removes a guest and chooses to revoke their devices
- **THEN** that person's trusted-device tokens are invalidated and they can no longer bypass the IP gate from any IP

### Requirement: Manual approval and revocation paths remain available

The system SHALL retain the desktop approval GUI and the read/remove web surface unchanged, so the
Operator can still approve an IP from observed attempts, rename or remove any guest, and removing a
guest SHALL still immediately terminate that IP's in-flight connections.

#### Scenario: Operator approves a new IP from attempts

- **WHEN** a new visitor is `403`'d and the Operator approves their IP from the desktop GUI
- **THEN** the visitor is admitted and, on a successful login, receives a trusted-device cookie for later IP changes

### Requirement: Authorization ends at the two gates

The system SHALL treat the IP/cookie gate and the password gate as the entire authorization model:
any request that clears both is fully trusted and SHALL NOT be subject to any further in-app
permission, role, or per-project scope check. Chat calls SHALL run unrestricted, bounded only by the
operating-system account the harness process runs as.

#### Scenario: A passed request runs unrestricted

- **WHEN** a request has cleared both the IP/cookie gate and the password gate and drives a chat turn
- **THEN** no per-project permission preset or other in-app authorization limits the actions it may take, and the agent may read, edit, and run shell/network actions subject only to the harness's OS account

#### Scenario: No project is restricted by a stored preset

- **WHEN** a chat turn runs for any registered project, regardless of any previously stored permission preset
- **THEN** no permission flags are injected into the `claude -p` call and the project is not constrained beyond the OS account
