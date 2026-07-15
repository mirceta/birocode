# Arch Agent — tasks

## 1. Backend: the `arch` virtual context

- [ ] 1.1 Promote Projects-Root derivation onto `RepositoryRegistry` (single source; `RepoController.ProjectsRoot()` delegates to it)
- [ ] 1.2 `RepositoryResolver`: exact-match branch for reserved id `arch` → synthetic `RepositoryInfo` (Id `arch`, Path = Projects Root, `IsGitRepo=false`), resolved BEFORE the unknown-id fallback; no self repo pinned → resolves to nothing (chat returns 400, never falls back)
- [ ] 1.3 Keep `arch` out of `GET /api/repos` and confirm `RepositoryRegistry.Add/Remove` cannot collide with the reserved id

## 2. Backend: role instructions on arch runs

- [ ] 2.1 Write `docs/arch-agent-role.md` — responsibilities (operate the playground via harness primitives), non-responsibility (harness feature dev → redirect to the harness dev chat), write-scope intent
- [ ] 2.2 `CliRunnerService`: optional append-system-prompt parameter through `RunAsync`/`CreateProcessInfo` (`--append-system-prompt`); repo runs pass nothing and their args stay byte-identical
- [ ] 2.3 `ChatController.Chat`: when the resolved context is `arch`, read the committed role file and pass it as the append prompt

## 3. Frontend: standing Arch chat view

- [ ] 3.1 `ChatContext`: fixed key `'arch'` (repoId `'arch'`, builder lane) added to the fixed-key allowlist so dock cleanup never drops it; session-resume like the harness view
- [ ] 3.2 `DockContext` + chat view switcher: add `'arch'` view beside `'harness'` with distinct icon/accent
- [ ] 3.3 `UiModeContext.FEATURES`: `archAgent: 'advanced'`; gate every Arch surface on it
- [ ] 3.4 i18n keys (`arch.*`) in `en.json` + `tr.json`; CSS for the distinct identity

## 4. Frontend: dashboard Arch tile

- [ ] 4.1 Dock toolbar: standing Arch entry that creates/toggles a dock tab with `repoId: 'arch'` (no delete of the conversation on hide)
- [ ] 4.2 `PinnedAgent`: chat-only rendering for the arch tile — deliberately hide repo chrome (path, git, local apps, discover blocks)

## 5. Docs + Understanding app

- [ ] 5.1 CLAUDE.md: short dev-vs-ops split statement + pointer to `docs/arch-agent-role.md`
- [ ] 5.2 Understanding app: update `understanding-app/index.html` to explain the arch/dev split and the `arch` virtual-context flow

## 6. Verify

- [ ] 6.1 Backend E2E on an isolated port: arch turn runs at the Projects Root (transcript lands under the encoded playground cwd); no-self-repo case returns 400; unknown non-`arch` id fallback unchanged; arch + repo runs concurrent, second arch prompt 409
- [ ] 6.2 Playwright on the isolated port: Arch view reachable with empty dock (Advanced), hidden in Basic; dashboard Arch tile shows chat without repo chrome; multi-turn resume on the arch chat
- [ ] 6.3 `openspec validate arch-agent --strict` passes
