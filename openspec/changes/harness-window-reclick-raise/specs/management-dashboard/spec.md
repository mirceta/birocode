## MODIFIED Requirements

### Requirement: The harness window holds one tab per repo agent and focuses an open tab instead of reloading it
In `window` mode the badge-link placement SHALL offer a viewer choice: **tabs** (default) or
**single**. With **tabs** the harness window SHALL be a normal Chrome window holding a
same-origin launcher tab (the Management bundle at `?launcher=1`) named
`birocode-harness-window`. The dashboard SHALL find or create that tab by name with no window
features **once per dashboard window** and keep its handle while the tab lives, looking it up
by name again only when there is no live handle — because a by-name lookup of an existing tab
brings that tab to the front. A badge click SHALL ask the launcher to open the agent's own
named tab, navigating it only when it did not exist. When the launcher reports the tab as
already existing, the **dashboard** SHALL raise that tab itself from its own click by opening
the agent's name with an empty URL (Chrome activates an existing named tab from the activated
page; a focus() call from the launcher does not), never reloading it; if that lookup returns a
blank tab it SHALL close it at once. A launcher tab that shows another same-origin page SHALL
be sent back to the launcher URL. When the launcher's open is popup-blocked the click SHALL
fall back to the agent's tab beside the dashboard and the Settings tab SHALL say to allow
pop-ups for the site. The Settings tab SHALL state the two one-time steps (drag the launcher's
window to the wanted monitor; allow pop-ups) and "Open the harness window now" SHALL create
the launcher tab. With **single** the earlier placed viewer SHALL be kept.

#### Scenario: A, then B, then A again
- **WHEN** the Operator clicks agent A, then agent B, then A again with the tabs viewer
- **THEN** the launcher opens A's tab next to itself, opens B's tab next to it, and the third click brings A's existing tab to the front (A is the active tab, the launcher is not) without reloading it and without opening any new tab

#### Scenario: A re-click never raises the launcher
- **WHEN** the dashboard already holds the launcher's handle and the Operator clicks an agent whose tab exists
- **THEN** the dashboard does not look the launcher up by name again, and the launcher tab does not come to the front

#### Scenario: The launcher was popup-blocked
- **WHEN** the launcher's window.open is blocked for a click
- **THEN** the agent's tab opens beside the dashboard instead and Settings shows "allow pop-ups for this site … and click again"
