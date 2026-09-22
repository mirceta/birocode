## 1. Build

- [x] 1.1 `LocalAppCatalog`: the pure join of the registry's list and the discovery cache, `Resolve` by id / name / port, how-to-run sentences.
- [x] 1.2 `RepoAgentToolbox.MyLocalApps` (list · status · start · stop · restart), `ILocalAppOps` / `RunnerOps` over the panel's runner and guards; environment fields; Event Console + audit.
- [x] 1.3 `my_local_apps` on the `claude-web` server (dispatch, catalogue, instructions); the Tools lane lists it.
- [x] 1.4 `docs/agents.md` names the tool.

## 2. Verify

- [x] 2.1 xunit: the join (registered + discovered, harness apps, unregistered findings, folder outside the repo), resolve, list / status wording, start (no command, already listening, launch), stop (guarded, not listening), restart, always-on refusal, the catalogue names nine tools.
- [x] 2.2 UI: the dock's Tools lane lists the ninth tool (`shot-dock-tools-harness.mjs`).

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
