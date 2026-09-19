# Tasks — hub-file-system

- [x] `HubFileStore` (Services/HubFs): the sandboxed store — path grammar, put / get / list / delete, provenance + version + note, limits, persistence; `AddHubFsModule`.
- [x] Repo-agent tools `hub_upload` / `hub_download` / `hub_files` (`RepoAgentToolbox.HubFs.cs`, MCP catalogue + dispatch + instructions; the environment carries the store and the machine label).
- [x] Arch tools `hub_files` / `hub_transfer` (`ArchAgentService.HubFs.cs`), the peer routes (`ArchPeerController`, `FleetClient`), role prompt v14 (the A-uploads → transfer → B-downloads ritual).
- [x] `HubFsController` (`GET /api/hubfs`, download, delete) + the File System tab (`FileSystem.jsx`, i18n en/tr, ManageApp tab) with the harness-served how-to.
- [x] `docs/hub-file-system-convention.md` (a `harness_help` topic by construction); `docs/agents.md` bullet.
- [x] xunit `HubFileSystemTests`; arch catalogue tests (29, v14); repo-agent catalogue (8); `shot-dock-tools-harness.mjs` mocks eight; `shot-manage-files.mjs`.
- [x] Understanding app (rolling latest): the design, the ritual, the sandbox, the tab.
- [x] Management bundle rebuilt; branch + PR (no merge, no deploy).
- [ ] Not covered here: a real two-machine transfer (the peer routes are exercised by the same fleet client and envelope as sends; the store and the tools are unit-tested).
