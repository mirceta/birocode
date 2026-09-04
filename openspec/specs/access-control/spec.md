# access-control Specification

## Purpose
Defines who may reach the harness: a strict IP allowlist gate plus revocable, device-bound
trusted-device cookies. These two gates (IP/cookie + the password layer) are the **entire**
authorization model — a request that clears them is fully trusted, bounded only by the OS account
the harness runs as, with no further per-project permission layer. Also covers the operator
surfaces to approve an IP and revoke a trusted device.
## Requirements
### Requirement: Strict IP gate is preserved for unapproved devices

The system SHALL reject any request whose client IP is not on the allowlist, is not
inside a configured LAN bypass range (see "Configured LAN ranges bypass the IP gate"),
and which carries no valid trusted-device cookie, returning the existing `403`
standalone rejection page before the static, SPA, or password layers are reached.
There SHALL be no fall-through to the login screen for such requests, so an
unapproved visitor cannot reach or attempt the password.

The sole path-based exception SHALL be the shared-ideas hub contract path (`GET`/`POST`
`/api/notes/hub/{token}`, segment-matched so `/api/notes/hub-info` stays gated): it SHALL be
served to any IP, because its embedded 256-bit token is the credential (same bearer-capability
trust model as an Apps Script `/exec` URL) and remote harnesses sync from addresses the Operator
never sees. This exception SHALL grant access to nothing beyond the hub contract handlers — a
wrong or absent token still answers only the `{ok:false, error}` envelope, and no other path
gains the bypass.

#### Scenario: Unknown visitor is rejected outright

- **WHEN** a request arrives from an IP not on the allowlist and not in a LAN bypass range, with no valid trusted-device cookie
- **THEN** it is rejected with `403` and the standalone rejection page, identical to the pre-change behaviour, and the password endpoint is never reached

#### Scenario: Unapproved IP reaches the hub path only

- **WHEN** a request from an IP not on the allowlist, with no trusted-device cookie, targets `GET` or `POST` `/api/notes/hub/{token}`
- **THEN** it bypasses the IP gate and is answered by the hub contract handler (token still decides between board data and the error envelope), while a simultaneous request from the same IP to any other path — including `/api/notes/hub-info` — is rejected with `403`

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

### Requirement: The Operator can set the access code from the desktop app

The system SHALL let the Operator set the harness access code from the WinForms desktop
application without supplying the current code, since the Operator at the host PC is already the
trusted authority for access control. Setting a new code SHALL hash it (PBKDF2) into the off-repo
auth store, SHALL enforce a minimum length, and SHALL revoke all active sessions so every client
re-authenticates with the new code. Changing the access code SHALL be possible ONLY from the
desktop app; the system SHALL NOT expose any web/phone endpoint that changes the access code (the
prior `POST /api/auth/password` change endpoint is removed).

#### Scenario: Operator sets a new access code

- **WHEN** the Operator enters a new access code (meeting the minimum length) in the desktop "Set access code" dialog
- **THEN** the code is hashed and persisted, all active sessions are revoked, and subsequent logins require the new code

#### Scenario: The access code cannot be changed over the web

- **WHEN** any web/phone request attempts to change the access code (e.g. `POST /api/auth/password`)
- **THEN** there is no endpoint that changes it — the code is changeable only from the desktop app

#### Scenario: A too-short code is rejected

- **WHEN** the Operator enters a new code shorter than the minimum length
- **THEN** the code is not changed and the dialog reports the validation error

### Requirement: Configured LAN ranges bypass the IP gate

The system SHALL admit a request past the IP gate, without an allowlist entry or
device cookie, when its resolved client IP falls inside one of the CIDR ranges
configured in `LanBypassCidrs`. The default SHALL be no ranges, so an unconfigured
harness behaves exactly as before. The test SHALL use the same resolved client IP as
the allowlist and the login throttle (last `X-Forwarded-For` hop when the socket
peer is a trusted proxy, else the socket address) and SHALL NOT use the socket peer
address when a forwarded address is available. Invalid entries SHALL be logged and
skipped at startup, never fatal. Such an admission SHALL be logged, SHALL NOT record
an allowlist access or attempt, SHALL NOT mint a trusted-device cookie, and SHALL
NOT bypass the password/session layer.

#### Scenario: LAN device without an allowlist entry

- **WHEN** a request arrives directly (socket peer not a trusted proxy) from 192.168.0.143 and `LanBypassCidrs` contains `192.168.0.0/24`
- **THEN** it passes the IP gate, a `[IPFILTER] Admitted 192.168.0.143 via LAN bypass 192.168.0.0/24` line is logged, no attempt is recorded, and protected `/api/*` routes still require a valid session or password

#### Scenario: Internet visitor through the trusted proxy

- **WHEN** a request arrives with socket peer 192.168.0.122 (a trusted proxy) and `X-Forwarded-For: 203.0.113.9`, and `LanBypassCidrs` contains `192.168.0.0/24`
- **THEN** the resolved IP is 203.0.113.9, the bypass does not apply, and the request is rejected with `403` unless approved or cookie-bearing

#### Scenario: Internet visitor forging a LAN first hop

- **WHEN** an internet client sends `X-Forwarded-For: 192.168.0.5` and the trusted proxy appends the true address so the header reads `192.168.0.5, 203.0.113.9`
- **THEN** the last hop 203.0.113.9 is the resolved IP and the bypass does not apply

#### Scenario: Direct peer cannot forge a forwarded address

- **WHEN** a request arrives directly from 203.0.113.9 (not a trusted proxy) carrying `X-Forwarded-For: 192.168.0.5`
- **THEN** the header is ignored, the resolved IP is 203.0.113.9, and the bypass does not apply

#### Scenario: No ranges configured

- **WHEN** `LanBypassCidrs` is empty (the default)
- **THEN** no request is admitted by the bypass and the gate behaves exactly as before

### Requirement: The LAN bypass fails closed without a forwarded address

The system SHALL NOT apply the LAN bypass when the socket peer is a trusted proxy (a
configured `TrustedProxyIps` entry or loopback) and the request carries no usable
`X-Forwarded-For` hop, even if the peer's own address is inside a configured range. Such a request SHALL be judged only by the allowlist, the device cookie and
the hub path, as before.

#### Scenario: Proxy stops forwarding the client address

- **WHEN** a request arrives with socket peer 192.168.0.122 (trusted proxy) and no `X-Forwarded-For` header, and `LanBypassCidrs` contains `192.168.0.0/24`
- **THEN** the bypass does not apply and the request is rejected with `403` unless 192.168.0.122 is an approved guest or the request carries a valid device cookie

#### Scenario: Loopback without a forwarded address

- **WHEN** a request arrives from 127.0.0.1 with no `X-Forwarded-For` and `LanBypassCidrs` contains `127.0.0.0/8`
- **THEN** the bypass does not apply; the request is admitted only by the seeded `127.0.0.1` guest (or a device cookie), as before

### Requirement: LAN bypass ranges are visible

`GET /api/ipfilter` SHALL report the configured ranges (`lanBypass`) and how the
caller was admitted (`callerVia`: `guest`, `lan`, `device` or `none`), and the Guests
page SHALL show the configured ranges. The web surface SHALL NOT be able to add,
change or remove ranges; they live only in the host's configuration.

#### Scenario: Guests page with a range configured

- **WHEN** `LanBypassCidrs` contains `192.168.0.0/24` and the Operator opens the Guests page
- **THEN** the page shows the range with a note that devices on it skip the guest list and still need the password, and offers no control to edit it

