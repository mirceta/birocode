## MODIFIED Requirements

### Requirement: The Management dashboard has a File System tab
The Management App SHALL offer a **File System** tab showing the live state of the hub file
system: this hub's store and every reachable peer's store, one block per machine, each rendered
as a **collapsible tree** in which every slash of a hub path is a folder level — a folder row
SHALL show the folder's name, file count, total size and latest change and toggle its subtree
open or closed (folders listed before files at every level, open by default, with expand-all
and collapse-all per machine); a file row SHALL show the file's name, who uploaded it and from
where, when it last changed, size, version and note, a stale mark past 30 days, a download link
and — for this hub's files — the Operator's delete behind a confirmation. A peer that did not
answer SHALL be named with its status, not hidden. Running and recent transfer jobs SHALL be
listed with their progress. The stats line SHALL state the volume's free space and that there
is no size limit. The list SHALL refresh every few seconds. The tab SHALL also show the how-to
served by the harness with the listing.

#### Scenario: Collapsing a folder hides its subtree
- **WHEN** the Operator clicks the `prg/` folder row that holds `fixtures/customers.json` and `fixtures/orders.json`
- **THEN** the `fixtures/` folder and both files disappear from the block, the `prg/` row reads closed with its count and size still shown, and clicking it again restores them

#### Scenario: A running transfer is visible
- **WHEN** the arch's `hub_transfer` of a 5 GB file is under way
- **THEN** the tab lists the job with its path, source, destination, status `running` and bytes so far with a percentage
