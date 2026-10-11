## ADDED Requirements

### Requirement: The remote lists the agents of the whole fleet, grouped by machine
The remote SHALL list agents grouped by machine: this harness's dock first, then every peer the paired harness's fleet status (`GET /api/arch/fleet/status`) knows, with that peer's docked agents and the fleet badges (busy from availability, unseen result from the latch). A machine that is not reachable SHALL stay listed, greyed and headed "dark", its agents not tappable; a harness without fleet status SHALL list its own dock alone, as before. The peer group SHALL contain exactly the agents of that peer's own dock.

#### Scenario: Two machines
- **WHEN** the paired harness has a reachable peer subscribed with its credential and the phone opens `/remote`
- **THEN** the list shows the paired harness's dock under its name and the peer's docked agents under the peer's label, and the peer group's names equal the names in the peer's `GET /api/dock`

#### Scenario: A peer went dark
- **WHEN** a subscribed peer stops answering
- **THEN** its group remains, marked dark, with its last known agents greyed, and tapping one only says the machine is not reachable

### Requirement: The paired harness relays an allow-listed handful of calls to a peer with its stored credential
The harness SHALL expose `GET|POST /api/remote/relay/{sourceId}/{path}` forwarding to the peer's own API with the credential the collector stores for that source (`X-Auth-Password`), for exactly: `GET dock`, `GET sessions/{id}/messages`, `GET sessions/{id}/tools`, `GET remote/screens`, `POST remote/commands`, `POST remote/pair/new`, `POST chat`, `POST chat/stop`; `X-Repo-Id` and the query string SHALL ride along; any other path SHALL be 404 here; an unknown source SHALL be 404; a peer that does not answer SHALL be 502. `POST chat` and `POST chat/stop` SHALL require the source's "allow sends" switch (403 with the Fleet-tab hint otherwise); for `chat` only the status line SHALL be awaited (the run is detached on the peer). Relayed bodies SHALL have the credential blanked and SHALL NOT be truncated. The phone SHALL write to, stop, peek at and answer a peer's agent through this relay — it is paired with the paired harness only and never holds a peer's credential.

#### Scenario: Off the allow-list
- **WHEN** a paired phone calls `GET /api/remote/relay/<peer>/repos`
- **THEN** the answer is 404 `not relayed` and nothing is sent to the peer

#### Scenario: Sends off
- **WHEN** the Operator has not allowed sends to that source and the phone posts `/api/remote/relay/<peer>/chat`
- **THEN** the answer is 403 naming the Fleet tab's switch, and the peer receives nothing

#### Scenario: Peek through the relay
- **WHEN** the phone taps a peer's agent
- **THEN** its last reply and any open question are read from the peer's own session through the relay and shown as for a local agent

### Requirement: Opening a peer's agent sends the big screen to that peer's harness, logged in by a one-shot PIN
`POST /api/remote/commands` SHALL take `screenOn` (where the phone believes the big screen is: `self` or a peer's sourceId) and `screen` (its name); the command SHALL be enqueued where the screen listens — this harness's queue, or forwarded to the peer's `remote/commands` through the relay. `open-agent {sourceId, repoId}` for a peer SHALL become a `navigate` to `<peer address>/remote?pin=<PIN>&then=/studio?agent=<repoId>&screen=<name>`, the PIN minted on the peer through the relay (single use, 5 minutes); without a credential for the peer the URL SHALL be the peer's studio alone (its login page) and the reply SHALL say so. `open-agent` for this harness's agent while the screen is on a peer, and a view tapped while away, SHALL `navigate` the screen home first. The remote page SHALL redeem `?pin=` at once and continue to a same-origin `then`; the big screen's dispatcher SHALL execute `navigate` for http(s) URLs only.

#### Scenario: The hop
- **WHEN** the big screen shows the paired harness and the phone taps an agent of a reachable peer the harness holds a credential for
- **THEN** within a few seconds the big screen shows the peer's studio with that agent — no login page — and heartbeats to the peer; the phone's header names the peer machine, and a zoom from the phone lands on that screen

#### Scenario: Back home
- **WHEN** the big screen shows a peer and the phone taps an agent of the paired harness (or a view)
- **THEN** the big screen returns to the paired harness's studio with that agent (or the view), continuing from the seq it had there, and the phone follows

#### Scenario: No credential for the peer
- **WHEN** the phone taps an agent of a peer subscribed without a credential
- **THEN** the big screen is sent to the peer's studio and shows its login page, and the phone says the harness has no credential for that machine
