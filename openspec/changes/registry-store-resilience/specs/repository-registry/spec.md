## ADDED Requirements

### Requirement: An existing repository store is never seeded over or persisted over when it cannot be read
The registry SHALL seed the first-run entry only when neither `repositories.json` nor `repositories.json.bak` exists. When the store exists it SHALL be read with retries on an I/O error; a store that is blank or cannot be parsed SHALL be replaced in memory by the backup when the backup reads; when neither reads the registry SHALL run read-only — no entry seeded, no save written, one error logged — until the next start.

#### Scenario: A transient read failure at boot
- **WHEN** another instance is writing the store at the moment this one starts
- **THEN** the read is retried and the roster loads unchanged; nothing is seeded

#### Scenario: The store is garbage and there is no backup
- **WHEN** the store exists but cannot be parsed and no `.bak` exists
- **THEN** the registry starts empty and read-only, the file is left exactly as it was, and the boot-time self-repo pin does not write

### Requirement: Every save keeps the previous store and writes atomically
The registry SHALL copy the current store to `repositories.json.bak` before each save and SHALL write the new store to a temporary file that is then moved over the store, so a crash or a concurrent reader can never leave a half-written store.

#### Scenario: A rename
- **WHEN** a repository is renamed
- **THEN** `repositories.json.bak` holds the store as it was before the rename and `repositories.json` holds the new one, with no `.tmp` left behind
