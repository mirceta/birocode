## ADDED Requirements

### Requirement: The Fleet topology tab draws the fleet's networks from the arch's perspective
The Management App SHALL have a Fleet topology tab that draws, with Cytoscape, every network a fleet computer lives on as a box, each computer inside its network (a computer on two networks between the boxes, with its address in each), the arch's link to each computer coloured by whether it answers, each proxy computer's one-way door from its home side to its business side, and each computer that proxies through it; it SHALL list a warning when proxy settings disagree, show a computer's or link's details on click, and give the same facts as a table.

#### Scenario: The hub as proxy computer, the living room through it
- **WHEN** the hub is a proxy computer for 192.168.1.105 and the living-room computer proxies through 192.168.1.101:5099
- **THEN** the tab shows 192.168.0.x and 192.168.1.x as two boxes, the hub between them, the door from 192.168.1.101 to 192.168.0.x, and the living room's "proxies through" link to 192.168.1.101, with no warning

#### Scenario: Settings disagree
- **WHEN** a computer proxies through a computer that is not a proxy computer, or that does not allow it
- **THEN** the tab says so in a warning line
