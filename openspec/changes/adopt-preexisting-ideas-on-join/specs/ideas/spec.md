# ideas — delta for adopt-preexisting-ideas-on-join

## ADDED Requirements

### Requirement: Pre-existing ideas are adopted on first contact with a store
The harness SHALL, when sync first points at a shared store — sync becoming
enabled, or the sync URL changing to a different store — make its FIRST sync
action a pull-merge-push exchange (the same CAS push used for local mutations) that
uploads every idea already on the local board into the shared store, merged
per-note with tombstone awareness so nothing already in the store is lost or
overwritten. Ideas born on a node before it ever joined the shared system MUST
NOT be stranded locally or silently dropped. If the seeding exchange fails
(store unreachable, CAS exhaustion), the board SHALL stay dirty and the upload
SHALL retry on subsequent poll ticks until it lands.

#### Scenario: Node with its own ideas joins the shared store
- **WHEN** a harness holding ideas created before sync was ever configured
  enables sync against a hub that already holds other ideas
- **THEN** the first sync exchange uploads the merged board, after which the
  shared store contains the union of both sides and the joining node's board
  shows the union too

#### Scenario: Nothing remote is lost by the join
- **WHEN** the seeding push lands on a store holding ideas and tombstones the
  joining node has never seen
- **THEN** every remote idea survives on the store and appears on the joining
  node, and remotely deleted ideas are not resurrected

#### Scenario: Joining while the store is unreachable
- **WHEN** sync is enabled while the shared store cannot be reached
- **THEN** local ideas keep working, and once the store is reachable the
  pre-existing ideas are uploaded without further user action

#### Scenario: Re-pointing at a different store seeds it too
- **WHEN** an already-syncing harness's sync URL is changed to a different
  shared store
- **THEN** the first exchange against the new store uploads the local board the
  same way (first contact with a new store is a join)
