# Tasks — hubfs-large-files-tree

- [x] `HubFileStore`: limits removed; `PutStream` (buffered copy to a temp file, incremental SHA-256, progress, free-space check), `Open` (FileStream); `Get`/`Put` kept as wrappers for small content and tests.
- [x] Repo agents: `hub_upload` streams the repo file, `hub_download` streams into the repo via a temp file; catalogue text says "any size, streamed".
- [x] Peer routes: `GET files/content` = raw body + `X-Hub-*` provenance headers; `POST files` = raw body, `[DisableRequestSizeLimit]`, data-rate guard lifted, sync IO allowed; legacy JSON/base64 body still accepted. `FleetClient`: untimed bulk client, `HubFileOpen` / `HubFilePutStream` / `CountingStream`.
- [x] `hub_transfer` as a background job with progress; `action: status` + `jobId`; role-independent (the tool description tells the arch to poll, not re-issue). Operator download streamed with ranges. Transfers shown on the File System tab.
- [x] `MCP_TOOL_TIMEOUT` = 2 h for repo-agent CLI turns.
- [x] `fileTree.js` + test; `FileSystem.jsx` tree (folder rows with count / size / latest, toggles, expand/collapse all); css; i18n en + tr; stats show free space, no limits.
- [x] `docs/hub-file-system-convention.md` (sizes section, the tree); how-to rules text.
- [x] xunit: streaming test (7 MB non-seekable stream, progress, hash, read back, free-space refusal); .NET 655/655; client 172/172; `shot-manage-files.mjs` 14/14 (tree, collapse/expand, transfers).
- [x] `.claudeweb-preview/hubfs-large-e2e.ps1`: 2.5 GB round trip on an isolated instance — pass, peak working set flat.
- [x] Bundle rebuilt; branch + PR (no merge, no deploy).
- [ ] Not covered: a real two-machine transfer job over the LAN (the same routes and client the e2e exercised over loopback).
