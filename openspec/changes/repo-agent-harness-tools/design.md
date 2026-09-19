# Design — repo-agent-harness-tools

## D1 · One server, three more tools (no new plumbing)

`RepoAgentMcpServer` (`POST /api/agents/mcp?repo=<id>`, bearer per process, injected into
every repo agent's turn by `RepoAgentToolsService` through `ToolsConfigStore.HarnessServers`)
gains three entries in `ToolsList()` and three dispatch arms. The toolbox
(`RepoAgentToolbox`) gets the three methods; its harness-facing dependencies arrive as one
optional `RepoAgentEnvironment` (delegates + stores), so the existing tests that build the
toolbox with a task graph alone keep compiling and the new tests fake the environment.

## D2 · `harness_help` — knowledge read off the harness, never typed in

- **Source of truth:** the convention docs in the harness's own checkout: `docs/*.md` of the
  repo the registry marks `IsSelf` (registered by `Program.EnsureSelfRepo` from the
  build's own root). Read on every call — a doc edited on main is the answer on the next call.
- **Fallback:** the same `docs/*.md` embedded in the assembly at build time
  (`<EmbeddedResource Include="..\docs\*.md" />`). Used only when the self repo is not on disk
  (a harness deployed without its checkout). The answer says which one it read
  (`source: live | embedded`, with the path).
- **Index = the docs' structure.** A topic per file (id = file name without `.md`, title = its
  first `#` heading, summary = its first paragraph) and a sub-topic per `##` section
  (`<file>#<slug>`). Aliases are derived, not listed: a query matches on words in the id,
  title, headings and text; "understanding app" finds `understanding-app-convention`.
- **For this repo.** Answers are prefixed with the caller's concrete facts: repo name, path,
  and the Local-tab URLs (`/api/localview/<repoId>/app/understanding/`, `…/goal/`), so
  "how do I update the Understanding app" is answered with *this* agent's own path.
- **Extensible by adding a doc.** A new `docs/<feature>.md` in birocode is a new topic on
  the next call; nothing to register.

## D3 · `stash_prompt` — the agent's own tab

The MCP URL names the repo, not the tab. The tab is resolved in this order: the tab whose
`SessionId` is the repo's running builder session (`RunSessionService.Get(repoId)`), else
the repo's dashboard tab, else its newest tab. No tab → refused with "open this agent in
the dock first". Text capped like the dock (4000). `first: true` reorders it to the head.
Result data = the queue after the add (position, count, ids), so an agent splitting a long
instruction can verify its own queue.

## D4 · `arm_my_loop` — the arch's arming path, shared

`ArchAgentService.StartLocalLoop` / `UpdateLocalLoop` become one `LoopArmer` in
`Services/Autopilot` (parameters `ArchLoopTools.LoopParams`, the store calls, the queue-tab
resolution, the recipe lookup, the session pin); the arch calls it with `by = arch`, the
repo agent with `by = agent` (`LoopConfigStore.ArmedByAgent`). Rules kept from the arch:

- gate closed (`AutopilotGate.Enabled == false`) → `not-accepting`, nothing changed — the
  Loop panel and the arch are refused the same way;
- `ValidateStart` / `ValidateUpdate` decide what a start needs; unknown kinds and modes are
  named back;
- the queue kind resolves the agent's own tab (D3) and refuses an empty stash;
- the session pin is the agent's running session → its tab's session → the newest transcript;
- one slot per agent: `start` on an armed loop re-arms it (as the panel does); `stop` keeps
  the record with reason `agent`; `status` returns `ArchLoopTools.View`.

Every arm/stop lands in the autopilot audit log under actor `agent:<repoId>`, and the Loop
panel shows "armed by agent".

## D5 · The Tools tab lists the harness server

`GET /api/tools?repoId=` adds `harness: { server: { name, transport, url, protocolVersion,
tokenSet }, tools: [tools/list entries] }`. `ToolsPanel.jsx` renders a "Harness tools" block
first (always on; per tool: name, description, parameters — the arch Tools lane's layout,
`archTools.css` classes), then the Birokrat section as today. No new endpoint, nothing to
save.

## D6 · Tests

- xunit: knowledge index/section/search over a temp docs dir; embedded fallback present;
  `stash_prompt` on a fake environment (adds, `first`, no tab); `arm_my_loop` over a real
  `LoopConfigStore` in a temp dir (goal start armed by agent, gate closed refused, queue
  needs a stash, stop, status); `tools/list` names the five tools; `LoopArmer` gives the
  arch the same outcomes as before (existing `ArchLoopToolsTests` stay green).
- UI: `client/tests/ui/shot-dock-tools-harness.mjs` — the dock's Tools lane over a mocked
  `/api/tools` shows the five harness tools above Birokrat.
