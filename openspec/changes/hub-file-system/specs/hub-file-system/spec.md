## ADDED Requirements

### Requirement: Every harness keeps a sandboxed hub file store
The harness SHALL keep a hub file store under its data directory (`hubfs/files` + an index),
addressed by hub paths: forward-slash-joined segments of letters, digits, dot, underscore and
dash, each starting with a letter or digit and at most 80 characters, at most 8 segments and
240 characters; backslashes SHALL be accepted as separators and dot segments, drive letters,
schemes and absolute paths SHALL be refused before anything touches disk. Every stored file
SHALL record who uploaded it (the agent's handle), from which machine, when it was first
uploaded and last changed, its size, SHA-256, content type, a version that grows on every
overwrite, an optional note, and — when the arch moved it — via which relay. The store SHALL
refuse a file over 64 MB, a store over 2 GB or 5000 files, and an overwrite that was not asked
for; it SHALL never expire files by itself, and deletion SHALL be the Operator's.

#### Scenario: A path that could escape is refused
- **WHEN** an agent uploads to `../secrets.json`, `C:/x`, `a/../b` or `-x/y`
- **THEN** the store refuses with the reason and writes nothing

#### Scenario: Overwrite bumps the version and keeps the first upload stamp
- **WHEN** `prg/fixtures/customers.json` (v1, uploaded by A at T1) is uploaded again with overwrite by B at T2
- **THEN** the entry reads v2, uploaded by B, uploadedAt T1, updatedAt T2, and the old bytes are gone

### Requirement: Files cross machines only through the arch
A repo agent SHALL see and touch only its own machine's store. The hub's arch SHALL move files
between machines over the fleet client: fetching a peer's file into the hub (kept there with
its provenance and `via: arch ← <peer>`), pushing a hub file into a peer's store (behind that
peer's accept-fleet-sends and this Operator's allow-sends), or peer → peer through the hub.
The peer API SHALL offer list, fetch (base64 with provenance) and push routes with the peer
envelope; a peer without them SHALL read as `no-peer-api`.

#### Scenario: A on MONSTER uploads, B on spacex downloads
- **WHEN** A uploads `prg/x.json` on MONSTER and the arch calls `hub_transfer` with from MONSTER
- **THEN** `prg/x.json` is on spacex's store with uploadedBy A, machine MONSTER, via `arch ← MONSTER`, and B's `hub_download` finds it
