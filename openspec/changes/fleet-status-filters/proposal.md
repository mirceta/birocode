# Proposal: fleet-status-filters — narrow the Status tab's agent wall

## Why

The Management App's Status tab lists every repo agent on every machine. With five
machines and dozens of agents the strips have become a wall: the only narrowing is
the four state chips tucked into the header line, there is no way to look at one
machine or to find an agent by name, and machines with nothing relevant still take
their full height. The operator asked for filters at the top.

## What

- A **filter bar** under the head, always visible: a **search box** (name, branch,
  remote URL, machine label; space-separated words all have to match), one chip per
  **machine** (multi-select; "all machines" clears), and the **state chips** — All ·
  on main · not on main · running · **🏛 managed** (new).
- Counts on the state chips follow the current machine selection and search; the
  head shows "N of M agents" while anything is narrowed, and a **× clear** button
  resets everything.
- A machine deselected in the machine chips is not rendered; a machine that is
  selected but has no agent left collapses to its header line with "n hidden by
  filter", so the page shortens instead of showing empty strips.
- The whole selection persists per device (localStorage), like the app's tab and
  layout choices.

## Out of scope

Sorting, grouping by repository across machines, and any change to the fleet status
endpoint — this is a client-only change on top of `GET /api/arch/fleet/status`.
