# Proposal: fleet-status-tab — one panel for the state of every repo agent on the fleet

## Why

The operator wants one place that shows the state of all repo agents across every
machine the way the dashboard's dock strip shows this box's docks: which are on their
default branch (free to be given work), which branch they are on, and whether a turn
is running. The events app's Agents tab only reconstructs "running" from the event
trail; the Arch tab's Fleet and Managed agents cards know more but only for the arch
scope. Neither is the panel asked for.

## What

- **`GET /api/arch/fleet/status`** on the hub: every machine (self + each subscribed
  harness) with its posture (reachable, build, behind, opt-ins, gate, managed count)
  and its repo agents — repos that hold a dock or are in the arch scope — each with
  branch, default branch, `onDefault`, dirty, running-since, last actor, availability,
  managed, docked. Remote agents come from the peer's cached describe (non-blocking).
- The peer describe gains **`docked`** and reads git for docked repos too, so a peer's
  agents carry their branch.
- A **Status** tab in the Management App (Arch · Ideas · Events · Status): one strip per
  machine in the dock-strip language (dot, name, branch), filters All / on main / not
  on main / running, a detail card per chip, machine headers with the Fleet-card
  posture; it also joins the side-by-side layout as a pane.
- The events app **drops its Agents tab**.

## Out of scope

Acting on agents from the Status tab (sends, arm, scope stay on the Arch surface).
