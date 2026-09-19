## MODIFIED Requirements

### Requirement: Every harness keeps a sandboxed hub file store
The harness SHALL keep a hub file store under its data directory (`hubfs/files` + an index),
addressed by hub paths: forward-slash-joined segments of letters, digits, dot, underscore and
dash, each starting with a letter or digit and at most 80 characters, at most 8 segments and
240 characters; backslashes SHALL be accepted as separators and dot segments, drive letters,
schemes and absolute paths SHALL be refused before anything touches disk. Every stored file
SHALL record who uploaded it (the agent's handle), from which machine, when it was first
uploaded and last changed, its size, SHA-256, content type, a version that grows on every
overwrite, an optional note, and — when the arch moved it — via which relay. There SHALL be
**no size limit**: every write SHALL stream through a bounded buffer to a temp file beside the
target (hashed on the way, progress reported) and be moved into place; every read SHALL hand
back a stream; the only size check SHALL be free space on the store's volume. The store SHALL
refuse an overwrite that was not asked for; it SHALL never expire files by itself, and deletion
SHALL be the Operator's.

#### Scenario: A multi-GB file passes through without being held in memory
- **WHEN** a 2.5 GB body is pushed through the peer route, listed, downloaded through the Operator route and the peer content route, and range-requested
- **THEN** both downloads are byte-identical to the source (SHA-256), the range answers the first bytes, and the harness process's peak working set does not grow with the file

#### Scenario: A path that could escape is refused
- **WHEN** an agent uploads to `../secrets.json`, `C:/x`, `a/../b` or `-x/y`
- **THEN** the store refuses with the reason and writes nothing

### Requirement: Files cross machines only through the arch
A repo agent SHALL see and touch only its own machine's store. The hub's arch SHALL move files
between machines over the fleet client as **streamed background jobs**: fetching a peer's file
as a raw body straight into the hub (kept there with its provenance and `via: arch ← <peer>`),
pushing a hub file as a raw body straight from disk into a peer's store (behind that peer's
accept-fleet-sends and this Operator's allow-sends), or peer → peer through the hub. The
`hub_transfer` tool SHALL answer when a job finished within a short wait, else `running` with a
job id and progress the arch polls with `action: status`. The peer API SHALL offer list, a raw
content route with the provenance in headers, and a raw push route with no request size limit
and the data-rate guard lifted (an older hub's JSON body still accepted); a peer without them
SHALL read as `no-peer-api`. Repo-agent CLI turns SHALL carry a two-hour MCP tool timeout so a
multi-GB `hub_upload` or `hub_download` is not cut off.

#### Scenario: A on MONSTER uploads a 5 GB dump, B on spacex downloads it
- **WHEN** A uploads `prg/db/prod.bak` on MONSTER and the arch calls `hub_transfer` with from MONSTER
- **THEN** the call answers `running` with a job id, `hub_transfer status` reports the bytes so far and finally `fetched`, the File System tab shows the job's progress meanwhile, and B's `hub_download` then streams the file into its repo
