# Hub file system: no size limit (streamed multi-GB), and a collapsible file tree

Board task `2f3b4f6456774b74b1c9f5515dd36c89` (Operator, 2026-09-19) — two follow-ups to
openspec `hub-file-system`.

## 1 · No size limit, the whole path streamed

The first cut capped a file at 64 MB and a store at 2 GB, held every file in a `byte[]`, and
moved files between machines as base64 inside JSON. A 5 GB database dump has to be a normal
upload. So:

- **The store** (`HubFileStore`): no per-file, per-store or file-count limit any more. `PutStream`
  copies any stream through a 1 MB buffer into a temp file beside the target, hashes on the
  way, reports progress, then moves it into place; `Open` hands back a `FileStream`. The one
  hard check is free space on the store's volume (a known length must fit with a 256 MB margin).
- **Repo agents**: `hub_upload` opens the repo file and streams it; `hub_download` streams the
  hub file into the repo through a temp file. Neither reads a file into memory.
- **Between machines**: the peer content route returns the RAW file with the provenance in
  `X-Hub-*` headers; the peer push route takes the RAW body (`[DisableRequestSizeLimit]`, the
  request data-rate guard lifted, synchronous IO allowed for the copy loop) with the provenance
  in the query — an older hub's base64 JSON body is still accepted. The fleet client gets a second
  `HttpClient` with **no timeout** for file bodies and streams both directions.
- **The Operator's download** streams from disk with range requests allowed and the response
  data-rate guard lifted.
- **Time**: a cross-machine `hub_transfer` runs as a **background job** — the tool answers when
  it finished within 20 s, else `running` with a job id and progress the arch polls
  (`action: status`); the File System tab shows running jobs with progress. The CLI's per-call
  MCP tool timeout is raised to two hours for repo agents (`MCP_TOOL_TIMEOUT`), so a multi-GB
  `hub_upload` is not cut off mid-copy.

Measured, not assumed: `.claudeweb-preview/hubfs-large-e2e.ps1` boots an isolated harness,
pushes a **2.5 GB** file (past 2³¹) through the peer route with curl as a raw body, lists it,
downloads it back through both routes, compares SHA-256s, checks a range request, deletes —
and watches the harness's **peak working set**, which stayed flat (248 MB before and after)
while 2.5 GB passed through twice. Upload 17 s, downloads 5 s and 12 s over loopback.

## 2 · A file tree

The File System tab renders every machine's store as a collapsible tree: every slash of a hub
path is a folder level; folder rows carry the file count, total size and latest change and
toggle open/closed (expand all / collapse all per machine); leaf rows keep the file's
provenance, size, version, note, stale mark, download and delete. Built by a pure, node-tested
helper (`fileTree.js`).

## Out of scope

Resumable (chunked) uploads after a dropped connection — a failed transfer is re-run; browser
uploads from the tab; automatic expiry.
