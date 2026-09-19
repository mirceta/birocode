# Design — hub-file-system

## D1 · One store per harness, the arch as the only bridge

The fleet's proven direction is hub → peer (the fleet client with the peer's stored password;
the peer's accept-sends opt-in for writes). A peer's repo agent cannot reach the hub — there is
no credential that way, and adding one would be a second trust model. So every harness keeps
its OWN store, repo agents only touch their machine's store, and the arch — which already
talks to every peer — moves files: `hub_transfer` fetches a peer's file into the hub (kept
there, provenance preserved, `via: arch ← <peer>`) and pushes a hub file into a peer's store
(`via: arch@<hub>` on the peer). Peer → peer goes through the hub in one call.

## D2 · The sandbox

`HubFileStore.Normalize` is the one path grammar (segments `[A-Za-z0-9][A-Za-z0-9._-]{0,79}`,
`/`-joined, ≤ 8 segments, ≤ 240 chars, no `.`/`..`, no `:`); `DiskPath` re-checks that the
resolved path is under `files/`. Repo-agent local paths go through `LocalPathUnder(repoPath)`
(relative, resolved, must start with the repo folder). Writes are temp + move. Limits are
checked before any write.

## D3 · Provenance and overwrite

`Entry`: path, size, sha256, contentType, uploadedBy (the agent's handle), machine (the
harness's label), uploadedAt (kept across overwrites), updatedAt, version, note, via. Overwrite
is explicit for agents (`overwrite`), implicit for the arch's fetch into the hub (a transfer is
a copy of the latest). Delete is the Operator's (File System tab) — agents only add.

## D4 · The peer routes

`GET /api/arch/peer/files?prefix=` → rows; `GET /api/arch/peer/files/content?path=` → bytes as
base64 with provenance; `POST /api/arch/peer/files` `{from, path, contentBase64, uploadedBy,
machine, note, uploadedAt, overwrite}` → stored, behind accept-fleet-sends. Same envelope
(`ok, status, detail, data`) and status vocabulary as every peer route; 404 → `no-peer-api`.

## D5 · The File System tab

`GET /api/hubfs` = `{ machine, stats, files, peers: [{machine, status, detail, allowSends,
files}], howTo }`; `GET /api/hubfs/file?path=` downloads; `DELETE /api/hubfs/file?path=`. The
tab polls every 5 s, marks files older than 30 days stale, and renders the how-to from
`howTo` (phrasings for the arch and for repo agents, the rules, the tool names) — authored in
`ArchAgentService.HubFilesHowTo` next to the tools, so the page cannot describe tools that do
not exist.

## D6 · Tests

xunit `HubFileSystemTests`: the path grammar (normalized and refused cases), put/get/list/
delete with provenance, versions, persistence and folder pruning, limits before writes, the
agent's upload (only inside the repo, text, overwrite, sandbox refusals) and download (default
folder, chosen folder, never clobbering silently, sandbox, not-found hint), the catalogue of
eight. Arch catalogue tests updated (29 tools, role v14). UI: `shot-manage-files.mjs` over a
mocked `/api/hubfs` (two machines, a stale file, a dark peer, the how-to, delete confirm).
