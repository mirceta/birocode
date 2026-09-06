## ADDED Requirements

### Requirement: Task filters shared by the Kanban and the Task graph
The Kanban and the Task graph SHALL each show a filter bar pinned at the top of the
view (it SHALL stay visible while the view scrolls or the canvas pans) holding a text
search, one chip per machine, one chip per repo agent labelled `<machine>/<handle>`
(the stable handle; when a fleet entry has no handle, `<machine>/<name>` with `#2`,
`#3`… when the name repeats on that machine), one chip per state (the Kanban columns,
read from the one column module so a new column appears automatically) and, when some
card carries them, `blocked` and `stale` chips. The machine and agent groups SHALL
include an Unassigned chip. Chips SHALL multi-select within a group and AND across
groups; each chip SHALL show the count it would produce given the other groups. The bar
SHALL offer a clear (×) and SHALL read "N of M tasks" when narrowed. Both views SHALL
read and write ONE filter, so a chip toggled in one view is toggled in the other.

#### Scenario: Machine and state together
- **WHEN** the operator selects the machine chip `spacex` and the state chip `In progress`
- **THEN** only tasks assigned to an agent on spacex that are in progress remain, and the counts on the other chips follow

#### Scenario: Unassigned
- **WHEN** the operator selects Unassigned in the machine group
- **THEN** only tasks with no assignee remain, in both views

#### Scenario: A new column
- **WHEN** the Kanban gains a column
- **THEN** a state chip for it appears without any change to the bar

### Requirement: Filtered-out tasks — hidden on the Kanban, dimmed on the graph
The Kanban SHALL not render filtered-out cards and SHALL keep every column header with
its count shown as "shown of all" while narrowed. The Task graph SHALL dim filtered-out
steps and keep their edges, and SHALL offer a "hide filtered" toggle that removes them
and any edge touching them. Clicking a legend entry on the graph SHALL apply the same
filter (a machine entry its machine chip, a repository entry the agent chips of its
tasks, the neutral entry Unassigned) and SHALL show as active when the filter selects it.

#### Scenario: Dim then hide
- **WHEN** the operator selects a state chip on the graph
- **THEN** the other steps stay on the canvas dimmed; turning "hide filtered" on removes them and their edges

#### Scenario: Legend click
- **WHEN** the operator clicks a machine entry in the graph legend
- **THEN** that machine's chip turns on in the bar and the URL carries `machine=<label>`

### Requirement: The filter lives in the URL and is remembered per browser
The filter SHALL be encoded in the page's query (`q`, `machine`, `agent`, `state`,
`flag`, `hide`; a key MAY repeat or hold a comma list; other query keys SHALL be left
untouched) and SHALL be saved per browser. On load a URL that carries any filter key
SHALL win; otherwise the browser's last filter SHALL apply and SHALL be written back to
the URL. Clearing SHALL remove every filter key from the URL.

#### Scenario: Shared link
- **WHEN** a browser opens `…?tab=kanban&machine=spacex&agent=spacex/prg%232&state=doing`
- **THEN** those chips are on and the board is narrowed accordingly

#### Scenario: Back to the board later
- **WHEN** the operator returns to the Kanban with a plain URL after filtering earlier
- **THEN** the last filter applies and the URL shows it
