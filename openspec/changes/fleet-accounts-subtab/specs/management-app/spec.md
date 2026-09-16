## ADDED Requirements

### Requirement: Fleet Status shows Claude plan usage by account

Fleet Status SHALL offer a **By plan / accounts** subtab, between Overview and
Scoreboard, addressable with `?fleetTab=accounts` and persisted like the other subtabs.
It SHALL list one card per Claude account signed in on any reachable fleet machine,
showing the account, its plan, the same usage meters the Overview shows for a machine
(5-hour window, weekly quota, scoped weekly windows), an "Overview as of" freshness line,
and the machines using the account. The card's usage SHALL be the freshest capture among
those machines, and SHALL be built from the same per-machine overview records and the
same fleet poll the Overview uses — no second data source or poll.

#### Scenario: Two machines on one account

- **WHEN** the hub and a peer are both signed in as `me@x.com` on the Max plan and the
  peer's usage capture is more recent
- **THEN** the subtab shows one `me@x.com` card, plan Max, "in use on 2 machines", with
  both machines as chips and the peer's 5-hour and weekly meters

#### Scenario: The account card never disagrees with the machine card

- **WHEN** the Operator compares an account's meters with the Overview card of a machine
  using that account
- **THEN** the values are the same rows the Overview renders for that machine

### Requirement: The hub remembers accounts no machine uses any more

The hub SHALL record every Claude account observed on a fleet poll — plan, last usage,
the machines using it and when it was last seen — to `fleet-accounts.json` in its data
dir, refreshing an account each time it is seen and leaving an account not seen untouched,
so the memory survives a hub restart. The fleet poll response SHALL carry this list as
`accountsLastSeen`. An account in that memory that no fleet machine currently uses SHALL
still appear on the By plan / accounts subtab, after the live accounts, visibly marked
stale ("not in use — last known state"), showing its last known usage and a "Last seen"
line with how long ago and on which machines.

#### Scenario: The laptop switches accounts

- **WHEN** the laptop, last seen on `old@z.com` with the 5-hour window at 77 %, signs in as
  `me@x.com` instead
- **THEN** the next poll refreshes `me@x.com` and keeps `old@z.com` as it was; the subtab
  lists `old@z.com` dimmed, plan and 77 % meter intact, "Last seen 2 h ago — no fleet
  machine uses this account now (was on laptop)"

#### Scenario: Memory survives a restart

- **WHEN** the hub restarts
- **THEN** every remembered account is still listed with the same last-seen record
