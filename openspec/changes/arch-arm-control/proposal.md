# One visible on/off for the arch agent

## Why

The Operator, 2026-10-16: the arch answered "the arch agent is disarmed; no sends" and there was no
arm/disarm control to be found. Investigation: the arch may send only while ANY arch loop runs (a
standing wake loop on some conversation, or a goal loop) — but nothing said so. The standing loop's
only switch sat in the Loops lane of a non-default conversation (the default one shows "not on this
conversation"); deleting the conversation that held it silently stopped it (recorded as "stopped by
the user"); goals then kept the arch on only while they ran, and when the last goal finished
(2026-10-15) the arch was off with no explanation anywhere.

## What changes

- **A bar at the top of the Arch tab, on every conversation, and in the Management App's arch
  cards (Status, Settings):** "Arch agent is ON — it can send tasks" / "is OFF — it cannot", what
  keeps it on (the standing loop, a goal — only while it runs), or why it went off and when — the
  last loop that ended AND what happened to the standing loop — and ONE button:
  **▶ Turn the arch on** / **■ Turn the arch off**. A "What turns the arch on and off" table.
  Blocked arming (autopilot gate closed, no managed agents) is said, button disabled.
- **The switch:** on = the standing wake loop (drive, no cap) on the conversation that holds it, or a
  dedicated "Standing loop" conversation created when needed; off = every running arch loop stops
  (standing loops and goals), with a confirmation that names them.
- **Removing a conversation** whose loop is running warns that the arch may turn OFF.
- **The refusal** the arch gets says why and where the Operator turns it on.
- `GET/POST /api/arch/armed`. The arming rule itself is unchanged.

## Impact

- Spec: `arch-agent` (ADDED).
- Code: `ArchAgentService.ArmControl.cs` (new), `ArchController` (2 routes), the refusal text;
  `ArchArmBar.jsx` + `armModel.js` (+ test), `Arch.jsx` (bar, remove warning).
