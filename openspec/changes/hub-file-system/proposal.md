# The hub file system — files between agents through the harness

Board task `3ad064a217114e5fa36f4de6e0c37a81` (Operator, 2026-09-19).

## Why

Agents often need to hand files to each other — test fixtures between two computers, a SQL
dump, a hand-off note — and today that means a shared database, a git commit that does not
belong in the repo, or the Operator copying by hand. The fleet already has one trusted channel
between machines (the hub's fleet client → a peer's `/api/arch/peer` surface, behind the peer's
password, with the peer's own "accept fleet sends" opt-in) and one trusted channel between the
harness and its repo agents (the `claude-web` MCP server, PR #126). A file system for agents
should ride those, not invent a third.

## What changes

**A sandboxed store per harness** (`HubFileStore`, `%APPDATA%\ClaudeWeb\hubfs\`): files under
short forward-slash paths of plain segments; an index with who uploaded (agent handle), from
which machine, when, size, SHA-256, a version that grows on overwrite, a note. Limits: 64 MB a
file, 2 GB / 5000 files a store. Never a window onto the real disk: dot segments, drive letters
and absolute paths are refused before anything touches it.

**Three repo-agent tools** on the existing `claude-web` server, listed in every Tools lane by
the existing catalogue: `hub_upload` (a file under the agent's repo, or a text), `hub_download`
(into the agent's repo, `hub-downloads/` by default, never clobbering silently), `hub_files`.
Local paths are kept inside the repo folder on both sides.

**Two arch tools**: `hub_files` (every machine's store — the fleet-wide list) and
`hub_transfer(path, from, to)` — the one way a file crosses machines: fetched from a peer into
the hub, pushed from the hub to a peer, or peer → peer through the hub. Pushes need this
Operator's allow-sends and the peer's accept-fleet-sends. Three new peer routes
(`GET files`, `GET files/content`, `POST files`) carry it; a peer on an older build answers
`no-peer-api` as everywhere. The role prompt (v14) teaches the ritual: A uploads, the arch
transfers, B downloads.

**A File System tab** in the Management dashboard: the live state — this hub's store and every
reachable peer's, one block per machine, with provenance, size, version, note, stale marks,
download and the Operator's delete (nothing expires by itself) — and the how-to: what to say
to the arch and to a repo agent, with the rules, served by the harness so the phrasings and tool
names cannot drift.

A convention doc (`docs/hub-file-system-convention.md`) states it for any agent — and is a
`harness_help` topic automatically.

## Out of scope

Peer → hub uploads without the arch (a peer's agent reaching the hub directly would need a
second credential direction); folder uploads (zip, or one file at a time); automatic expiry.
