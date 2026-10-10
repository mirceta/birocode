## ADDED Requirements

### Requirement: The home computer opens business addresses through the Hub
The home bridge SHALL let each allowed home computer open any address in the allowed business range (`http://192.168.0.x:port`) in Chrome at its real address, by a setup script that sends only those addresses to the bridge and everything else direct.

#### Scenario: Open a fleet harness from home
- **WHEN** the setup script is on at 192.168.1.105 and the Operator opens `http://192.168.0.42:5099`
- **THEN** the harness of 192.168.0.42 loads with that address in the bar, and live updates stream

### Requirement: The business network never reaches the home network
The bridge SHALL listen only on the Hub's home-side address, SHALL NOT enable IP forwarding, and SHALL forward only connections started by an allowed home computer, so no computer on the business network can open a connection to the home network through it.

#### Scenario: A business computer tries the bridge
- **WHEN** anything on 192.168.0.x connects to the bridge port on 192.168.0.138
- **THEN** nothing answers

### Requirement: The bridge is not an open proxy
The bridge SHALL serve only clients in its allow-list (enforced by the firewall rule and again by the bridge) and SHALL forward only to IPv4 literals inside the allowed target range; any other client is dropped and any other target answers 403, each logged.

#### Scenario: Another home device or another destination
- **WHEN** a client other than 192.168.1.105 connects, or the allowed client asks for 192.168.1.1, a host name, or the internet
- **THEN** the client is dropped, or the request answers 403, and the log records it

### Requirement: The bridge has an on and an off switch
`install.ps1` SHALL turn the bridge on (publish, firewall rule, start at logon) and `uninstall.ps1` SHALL turn it off (stop it, remove the task and the rule), each in one command on the Hub.

#### Scenario: Turn it off
- **WHEN** the Operator runs `uninstall.ps1` on the Hub
- **THEN** port 3128 stops answering and the firewall rule and logon task are gone
