# The hub file system — the convention

This is the **agent-agnostic statement** of how files move between agents in the Claude Web
fleet. Any repo agent on any machine can read it off disk (or ask its harness with
`harness_help topic hub-file-system-convention`) and use the hub file system from then on.

> The harness references this file as the single source of truth. If the convention changes,
> change it **here**.

## What it is

Every harness keeps a **hub file store**: a sandboxed folder under its own data directory
(`%APPDATA%\ClaudeWeb\hubfs\`), with an index of who uploaded what, from which machine, when,
how big, its SHA-256, a version and a note. It is **never** a window onto the real file
system: a hub path is a short forward-slash path of plain segments, and every path is
resolved strictly inside the store.

Three tools on every repo agent's harness MCP server (`claude-web`):

| tool | what it does |
|---|---|
| `hub_upload(path, localPath \| text, note?, overwrite?)` | reads a file **under your repo folder** (or a text) and stores it under a hub path |
| `hub_download(path, localPath?, overwrite?)` | writes a hub file **into your repo folder** (`hub-downloads/<hub path>` by default) |
| `hub_files(prefix?)` | lists this machine's store |

Two tools for the arch agent: `hub_files` (every machine's store) and `hub_transfer(path,
from, to)` (move a file between machines). The Operator watches every store on the Management
dashboard's **File System** tab and deletes there.

## The one rule about machines

A repo agent sees **its own machine's** store only. A file uploaded on machine A reaches
machine B **through the arch**: the arch fetches it from A into the hub and pushes it to B
(`hub_transfer`). On one machine no transfer is needed — B downloads what A uploaded.

The ritual, when the Operator says "have A upload X, then have B download it":

1. the arch sends A: *"upload `<files>` to the hub file system as `<prefix>/<name>`"*;
2. A replies with the hub paths it stored;
3. the arch `hub_transfer`s each path from A's machine to B's (skipped on one machine);
4. the arch sends B: *"download `<hub path>` from the hub file system into `<folder>`"*.

## Naming

- A hub path: segments of letters, digits, `. _ -`, each starting with a letter or digit,
  joined by `/`; at most 8 segments, 240 characters. No drive letters, no `..`.
- **Namespace** by agent or purpose so the arch can name a file unambiguously:
  `prg/fixtures/customers.json`, `webflow/testdata/2026-09.csv`, `notes/handoff-to-prg.md`.
  Every slash is a folder level on the File System tab's collapsible tree.
- Uploading to an existing path **replaces** it (version + 1) — only with `overwrite`; say
  so on purpose, never by accident.

## Sizes and retention

- **No size limit.** A multi-GB file — a whole database dump — is a normal upload. Every
  upload, download and transfer is **streamed** to disk through a small buffer; nothing is held
  in memory, on either side. The only check is free space on the store's volume.
- A cross-machine `hub_transfer` of a big file runs as a **background job**: the arch's call
  answers `running` with a job id after ~20 s and polls it (`action: status`) until it reads
  `fetched` or `pushed`. Agents' own uploads/downloads take as long as a disk copy.
- Nothing expires by itself. Files older than **30 days** are marked *stale* on the File
  System tab; the Operator deletes what is no longer needed. Agents only add.

## Sandbox

- A download lands inside the agent's repo folder — never elsewhere; an upload reads from
  inside it — never elsewhere. Absolute paths and `..` are refused on both sides.
- Pushing a file **into** a peer's store needs that peer's Operator opt-in ("accept fleet
  sends") and this Operator's "allow sends" to it — the same trust as a task send.

## What to say

To a **repo agent** (in its dock):

- *upload tests/fixtures/customers.json to the hub file system as prg/fixtures/customers.json*
- *list the hub file system and download prg/fixtures/customers.json into tests/fixtures/*
- *put this text on the hub as notes/handoff.md: …*

To the **arch**:

- *arch, have spacex/prg#1 upload its test fixtures (tests/fixtures) to the hub as prg/fixtures/, then have MONSTER/web-flow-autodev#1 download them into tests/fixtures*
- *arch, what is on the hub file system?* · *arch, move prg/customers.sql to MONSTER*
