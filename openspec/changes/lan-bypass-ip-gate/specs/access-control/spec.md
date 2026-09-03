## MODIFIED Requirements

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

## ADDED Requirements

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
