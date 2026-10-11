## ADDED Requirements

### Requirement: Each harness has an obvious proxy role setting
The Management App's Settings tab SHALL show, first, a Network proxy section where the Operator picks this computer's role — not part of a proxy setup, a proxy computer, or a computer that proxies through a proxy computer — with the role's fields, a sentence saying what the choice does, this computer's addresses and its current state; saving SHALL apply the role at once and persist it on this harness.

#### Scenario: Make the hub the proxy computer
- **WHEN** on the hub the Operator picks "This computer is a proxy computer", home side 192.168.1.0/24, allowed 192.168.1.105, business side 192.168.0.0/24, and saves
- **THEN** the section says it is ready on 192.168.1.101 at the harness port and shows the setup-script address

### Requirement: A proxy computer forwards one way, for allowed computers only
A harness in the proxy role SHALL forward a browser's proxy request only when it arrived on the harness's home-side address, the caller's own address is allowed, and the target is an IPv4 address in the business range; every other proxy request SHALL be refused with its reason and recorded. It SHALL NOT forward toward the home side, open a tunnel, or need IP forwarding, a new port or a firewall change.

#### Scenario: The home computer opens a business harness
- **WHEN** 192.168.1.105 asks the hub at 192.168.1.101 for http://192.168.0.42:5099/
- **THEN** the page of 192.168.0.42 comes back, streaming as it is sent

#### Scenario: Anything else
- **WHEN** a request arrives on the hub's business-side address, or from an address not allowed, or for the home router, a host name or the internet
- **THEN** it answers 403 with the reason, and the section's recent requests show it

### Requirement: A computer that proxies through a proxy computer reaches business addresses as they are
A harness in the client role SHALL route its own calls to the business range through the proxy computer, SHALL serve a setup script that sends only business addresses there, and — unless the Operator unticks it — SHALL point this Windows user's browser at that setup script, writing only when no other script is set and removing only its own.

#### Scenario: Chrome on the living-room computer
- **WHEN** the living-room harness proxies through 192.168.1.101:5099 with the browser box ticked
- **THEN** typing http://192.168.0.42:5099 in Chrome opens that harness at that address, while every other address stays direct

### Requirement: Each harness reports its proxy role to the hub
The peer describe SHALL carry this computer's proxy role, its settings and its IPv4 addresses, so the hub can draw the fleet's networks; a peer that predates the field SHALL show as role unknown, never as an error.

#### Scenario: An older peer
- **WHEN** a peer's describe has no proxy field
- **THEN** the hub reports its role as unknown
