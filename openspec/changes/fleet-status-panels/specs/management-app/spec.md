## ADDED Requirements

### Requirement: Fleet Status per-machine panel tabs

The Management App's Fleet Status SHALL present, per machine, a tabbed panel: **Agents**
(the existing agent strip, the default tab), **Overview** (harness version + build, host
info, host active and admin active, GitHub account, Claude info — reusing the harness's
own Status panel look, with "n/a" for any field a machine did not report), and
**Scoreboard** (the same view the harness's own header Scoreboard renders, loaded on
demand with a spinner and a Refresh button). The selected tab SHALL be remembered per
browser and reflected in a `?fleetTab=` URL parameter so a specific tab can be pinned on a
shared screen. The existing agent search + machine filter bar continues to work.

#### Scenario: Switching tabs

- **WHEN** the operator selects Overview or Scoreboard
- **THEN** every shown machine card renders that view, and the choice persists across
  reloads and is written to `?fleetTab=`

#### Scenario: URL pins a tab

- **WHEN** the page is opened with `?fleetTab=overview`
- **THEN** the Overview tab is shown regardless of the browser's last choice

#### Scenario: Machines on different builds

- **WHEN** two machines are shown and one predates the overview fields
- **THEN** both cards render the tabs; the modern machine shows its values and the older
  one shows "n/a" for the fields it did not report
