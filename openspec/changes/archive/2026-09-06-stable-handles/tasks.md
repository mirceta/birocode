## 1. Handles

- [x] 1.1 `Handles` (pure): slug, `AssignRepoHandles` (unique, keeps existing, first free
      suffix), `ParseAgentRef`, `ResolveRepoRef`, `ParseIdeaRef`, `IdeaHandle`.
- [x] 1.2 Repos: `RepositoryConfig.Handle` persisted; assigned on add; one-time backfill on
      load; `RepositoryInfo.Handle`; `/api/repos` and the Arch state expose `handle`.
- [x] 1.3 Ideas: `Note.Number`; allocated on add; backfilled on load and after a merge;
      `FindByRef` ("#12" / "12" / id, ambiguity reported).

## 2. Tools + wire

- [x] 2.1 `list_ideas` → handle; `list_agents` / `list_machines` / fleet status → handle;
      `idea_to_task` by `#12`; `send_task`, `git_state`, `read_transcript`, `assign_task`,
      `create_task` resolve handle | name | id through `ResolveAgentRef`; descriptions.
- [x] 2.2 Peer describe carries `handle`; `PeerRepo.Handle`; hub fallback for older peers;
      contract doc §5.

## 3. UI

- [x] 3.1 Ideas list `#12`; Kanban `💡 #12` + assignee = handle; Status chips = handle;
      Arch managed-agents card shows the repo handle; dashboard dock chips show the `#k`
      suffix + full label in the tooltip.

## 4. Verify

- [x] 4.1 Unit tests (`HandlesTests`): slug, uniqueness + stability + backfill order of repo
      handles, agent-ref parsing, resolution by id/handle/unique name with ambiguity
      reported, idea numbers (allocation, survive edit + reload, backfill of an old store,
      lookup, ambiguity after a merge, merge backfill). Whole suite green.
- [x] 4.2 Live check after deploy: Ideas list shows `#N`,
      Status chips read `<machine>/<repo>`, spacex's two `prg` read `prg` / `prg#2`.
      DONE 2026-09-06 09:49 (deployed f05eaa5 from feature/handles merged with main, kept):
      68 ideas numbered on live (#1 = the oldest), 19 repos with unique handles, the two
      `prg` repos read `prg` / `prg#2` on the Status tab and in the arch tools.
