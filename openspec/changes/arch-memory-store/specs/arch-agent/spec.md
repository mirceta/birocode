## ADDED Requirements

### Requirement: The arch's memory is a visible store on the hub
The arch agent's memory SHALL live in a store owned by the hub harness (single writer), as entries with id, title, markdown body, kind (principle | rule | fleet-fact | repo-note | goal-note | other), tags (machine, repo, goal), author, created, updated, lastConfirmed, lastUsed, status (active | retired), pinned and a version history, and the Management dashboard SHALL show it on a "Memory" tab where the Operator reads, searches, filters (kind, tag, author, status, stale, review, used, pinned), adds, edits, pins, retires, restores, confirms ("still true") and deletes entries, with a STALE badge after a configurable age since the last confirmation and a "used recently" badge for entries loaded within the last N arch turns.

#### Scenario: The Operator writes a principle
- **WHEN** the Operator adds an entry of kind principle on the Memory tab with a one-line reason
- **THEN** it is stored by the hub, shown under Principles, and marked "always loaded"

#### Scenario: A stale entry
- **WHEN** an active entry has not been confirmed for longer than the configured number of days
- **THEN** its card shows STALE until someone confirms it is still true

### Requirement: Every arch turn loads principles always and knowledge when relevant
On every arch turn — the Operator-facing chat, wake turns and goal conversations — the harness SHALL load the active principles and pinned entries into the arch's context, and other active entries only when one of their tags matches (as a whole word) the message, the conversation, its goal or the names of the goal's repos; what was loaded SHALL be recorded as used. The arch's remember and recall tools SHALL read and write this store, with confirm_memory and retire_memory beside them, and goal progress SHALL go into the goal's step plan rather than the store.

#### Scenario: An edit from the tab reaches the next turn
- **WHEN** the Operator edits a principle on the Memory tab and then messages the arch
- **THEN** that turn's context carries the edited text, and the entry shows as used recently

#### Scenario: Knowledge by tag
- **WHEN** a turn's message names the repo prg and an active entry is tagged repo:prg
- **THEN** that entry is loaded into the turn, and an entry tagged with another repo is not

### Requirement: Memory writes are guarded
A write to the memory store SHALL be refused with a visible reason when it looks like a secret (tokens, keys, private keys, passwords, connection strings, URLs with credentials), when it has no kind, or when it has no one-line reason; the arch SHALL be able to add, update, confirm and retire entries but never delete one — only the Operator deletes.

#### Scenario: A secret is refused
- **WHEN** the arch or the Operator tries to store a connection string with a password
- **THEN** nothing is stored and the refusal says it looks like a secret and to record where it lives instead

#### Scenario: The arch cannot delete
- **WHEN** the arch decides an entry is no longer true
- **THEN** it can only retire it, and the Operator decides whether to delete it

### Requirement: The old memory files are imported once
On first run the hub SHALL import the arch home's memory/*.md files as entries (author arch, kind by content, dates from the home's git history, marked for the Operator's review, a secret-looking body withheld) and seed the Operator's two first principles, without changing the files.

#### Scenario: First run
- **WHEN** the hub starts with the new store and the arch home holds memory files
- **THEN** each file appears on the Memory tab marked "review", and the two principles appear pinned under Principles
