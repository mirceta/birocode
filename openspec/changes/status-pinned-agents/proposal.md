# Status tab: pinned agents (fleet task 61a0d521)

## Why

The Status tab lists every repo agent of every machine, about 70 when the whole fleet answers. The Operator opens a
handful of them over and over and has to find them in that list each time. They want to pin those agents, from any
machine, to a bar at the top of the tab, and unpin them again.

## What changes

- **A pinned bar at the top of the Status tab**, above the machine sections. It shows the pinned agents in pin order,
  and is hidden when nothing is pinned.
  - **Live pins** use the same chip the list uses: the same live state, dot, finished "!" and ✓ checked, and the same
    colour and mark. They are labelled `machine / agent`. A click expands the agent's details under the bar; a
    double-click opens the harness with the same target, through `openAgentHarness`.
  - **Pins that can't be shown live stay, greyed, with the reason.** That covers a pin whose machine is not answering,
    is no longer in the fleet, or doesn't list the agent right now. Before the first fleet poll answers they say
    "loading the fleet…".
- **Pin and unpin.** Every list chip, on every machine, gets a pin control beside it: 📍, shown on hover. A pinned
  chip shows 📌 there permanently, and the bar's 📌 unpins. Pinning is idempotent.
- **Stored on the hub**, next to the view presets, in `status-pins.json`:
  - `GET/POST /api/settings/status-pins` (pin / unpin, idempotent) and `PUT …/order` (reorder; no UI for it yet);
  - keyed by the machine's sourceId (`self` for this harness) + repoId, so a pin survives reloads, other browsers and
    agent renames;
  - the machine and agent names are remembered only to label a greyed pin.

## Impact

- **Server:** `StatusPinsService` + `StatusPinsController` (Settings module); tests: `StatusPinsTests`.
- **Client:**
  - `manage/statusPins.js` (+ test);
  - `FleetStatus.jsx`: the bar, `PinButton`, and an optional machine prefix on `AgentChip`;
  - `manage.css`;
  - the committed manage bundle.
