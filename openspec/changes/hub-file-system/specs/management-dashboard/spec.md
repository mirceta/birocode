## ADDED Requirements

### Requirement: The Management dashboard has a File System tab
The Management App SHALL offer a **File System** tab showing the live state of the hub file
system: this hub's store and every reachable peer's store, one block per machine, each file
with its hub path, who uploaded it and from where, when it last changed, size, version and
note, a stale mark past 30 days, a download link and — for this hub's files — the Operator's
delete behind a confirmation; a peer that did not answer SHALL be named with its status, not
hidden. The list SHALL refresh every few seconds. The tab SHALL also show the how-to: example
phrasings for the arch and for a repo agent, the tool names each uses, and the rules (paths,
limits, overwrite, retention, sandbox, the one-machine-per-agent rule) — all served by the
harness with the listing so they match this build's tools.

#### Scenario: The Operator sees a file the arch moved
- **WHEN** the arch transferred `prg/x.json` from MONSTER to the hub
- **THEN** the hub's block lists it with uploadedBy the MONSTER agent, `via arch ← MONSTER`, and MONSTER's block still lists its own copy

#### Scenario: Delete needs a confirmation
- **WHEN** the Operator clicks ✕ on a hub file
- **THEN** a confirmation names the path and only "Delete now" removes it
