## ADDED Requirements

### Requirement: Status tab states render as badges

The Status tab SHALL render every machine state and count — harness build, hub sync,
fleet sends / upgrades opt-ins, operator gate, sends-allowed, reachability status and
detail, agent / managed / running / hidden counts — and every agent-detail fact and toned
Overview value as a badge from one shared primitive with one tone set (ok, warn, bad,
muted, unknown, accent), legible in the light and dark schemes, never as a "·"-joined
text run. Every field SHALL keep its value; an unknown value SHALL show "unknown" as the
badge with its reason in full beside it.

#### Scenario: A peer behind the hub with its gate closed

- **WHEN** the fleet feed says a reachable peer runs a different build than the hub,
  accepts sends and upgrades, has its gate closed and this hub may not send there
- **THEN** its header shows the pills `build <sha>`, `behind the hub` (warn),
  `accepts sends` (ok), `accepts upgrades` (ok), `gate closed` (warn), `sends not
  allowed` (muted), and its counts as pills on the right

#### Scenario: An unreachable machine

- **WHEN** the hub could not reach a machine
- **THEN** its header shows its status as a bad badge and the detail beside it, and
  every Overview value reads `unknown` with the reason

#### Scenario: Overview unknowns keep their reason

- **WHEN** a reachable peer's build reports no overview
- **THEN** each affected Overview row shows an `unknown` badge followed by "this
  machine's build reports no overview"
