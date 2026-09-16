# Fleet Status: a "By plan / accounts" subtab

## Why

The Fleet Status Overview shows Claude plan usage **per machine**. Several machines in
the fleet sign in with the same Claude account, so the Operator reading "how much of the
Max plan is left" has to find the machines on that account and mentally merge their
cards. The question is per account, not per machine. (Fleet task 663237ad.)

The Overview also forgets an account the moment no machine uses it: switch the laptop to
another account and the old plan's state disappears, although its window is still
ticking down and the Operator may switch back.

## What changes

- Fleet Status gets a fourth subtab, **By plan / accounts**, between Overview and
  Scoreboard, addressable with `?fleetTab=accounts` and persisted like the others. It
  lists one card per Claude account used anywhere in the fleet: the account, its plan,
  the **same** usage meters the Overview shows (5-hour window, weekly quota, scoped
  weekly), an "Overview as of" freshness line, and chips for the machines using it. The
  usage is the freshest capture among those machines.
- Same data, same poll: the subtab is built from the `machines[].overview.claude` the
  Overview already reads on the 5-second fleet poll — no new endpoint, no second poll.
- The hub remembers accounts: `FleetAccountsStore` records every account seen on each
  fleet poll to `fleet-accounts.json` in the data dir (per account: plan, last usage,
  machines, when). An account no fleet machine uses any more still appears on the
  subtab, from that record, dimmed and badged "not in use — last known state", with a
  "Last seen … (was on …)" line. The memory survives a hub restart. The fleet poll
  response carries it as `accountsLastSeen`.

## Non-goals

No new usage probe and no change to how a machine's Claude usage is captured. No
per-account history or charts. Nothing is written to the peers.
