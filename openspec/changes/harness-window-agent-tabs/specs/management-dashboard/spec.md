## ADDED Requirements

### Requirement: The harness window holds one tab per repo agent and focuses an open tab instead of reloading it
In `window` mode the badge-link placement SHALL offer a viewer choice: **tabs** (default) or
**single**. With **tabs** the harness window SHALL be a normal Chrome window holding a
same-origin launcher tab (the Management bundle at `?launcher=1`) named
`birocode-harness-window`; a badge click SHALL find or create that tab by name with no window
features, wait briefly for its hook while it loads, and ask it to open the agent's own named
tab — navigating it only when it did not exist and only focusing it otherwise, never
reloading. When the launcher's open is popup-blocked the click SHALL fall back to the agent's
tab beside the dashboard and the Settings tab SHALL say to allow pop-ups for the site. The
Settings tab SHALL state the two one-time steps (drag the launcher's window to the wanted
monitor; allow pop-ups) and "Open the harness window now" SHALL create the launcher tab. With
**single** the earlier placed viewer SHALL be kept.

#### Scenario: A, then B, then A again
- **WHEN** the Operator clicks agent A, then agent B, then A again with the tabs viewer
- **THEN** the launcher opens A's tab next to itself, opens B's tab next to it, and the third click focuses A's existing tab without reloading it

#### Scenario: The launcher was popup-blocked
- **WHEN** the launcher's window.open is blocked for a click
- **THEN** the agent's tab opens beside the dashboard instead and Settings shows "allow pop-ups for this site … and click again"
