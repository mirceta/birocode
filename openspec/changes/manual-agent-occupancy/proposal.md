# Manual agent occupancy: the Operator sets who is free, the Status tab shows it in two sections

Fleet task `3a978f93b41e4629b8af6cb1b7ca1765` (Operator, 2026-09-22).

## Why

Today an agent counts as free when it sits on its default branch and occupied otherwise.
The Operator says that rule is too crude: agents are sometimes linked (when `web-flow-autodev`
is on a feature branch, `prg` is not free either, whatever branch it is on), and a branch says
nothing about who is about to use the agent. The human at the fleet has to be able to set
occupancy by hand, and that setting has to be what everything downstream reads as "free to
take work".

## What changes

- **A per-agent Operator setting**, `occupied` / `free` / automatic, persisted on the harness
  that sets it (`occupancy.json` in the data dir, keyed like the board's assignees:
  `sourceId|repoId`). It survives refresh and restart.
- **Composition, stated once**: the Operator's setting overrides the branch rule; a running
  turn (`busy`), an unmanaged repo and an unreachable peer are never overridden. For the arch
  agent this is applied inside the availability verdict: *occupied* → `claimed` with the
  reason `operator-occupied` (no sends, no transcript reads, unless the Operator asks);
  *free* → `available` (an unassigned branch still has to be named in a send). `list_agents`,
  `send_task`, the fleet describe a peer reads, and the Status tab all see the same answer.
- **Status tab**: every agent's expanded details gain a three-way control — **occupied ·
  free · automatic** — with what is in effect and why. Free and occupied agents look
  different at a glance (green vs amber edge, ✋ when the Operator set it), and each machine's
  agents are split into **Occupied** on top and **Free** below, each with its count. The state
  chips become `free` / `occupied` (the old `on main` / `not on main` choices map onto them).
- A hub's setting about a peer's agent is the hub's view (applied to the fleet describe it
  reads); a setting made on the peer's own harness travels with its describe to every hub.

## Groups (proposed, not built)

The per-agent toggle covers "mark prg occupied because web-flow-autodev is". A clean model
for real groups: an optional `group` label per agent in the same store; setting occupancy on
any member applies to the group, the Status tab draws a bracket around members, and the
branch rule for the group is "occupied if any member is off its default branch". It is one
more field and a second store method; proposed for a follow-up once the toggle has been
lived with.

## Out of scope

Automatic detection of linked agents; occupancy history; peers setting a hub's occupancy.
