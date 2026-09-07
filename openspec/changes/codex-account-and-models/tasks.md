# Tasks: codex-account-and-models

## 1. Codex account chip (the Claude chip's twin)

- [x] 1.1 `CodexAccountService`: identity from the login's id-token claims (email, name, ChatGPT plan, subscription end, auth provider); plan-slug → label; claims only, no token value returned/logged
- [x] 1.2 `CodexUsageService`: ChatGPT backend usage (5h/weekly windows, per-model limits, credits, available models) with the same token boundary and cache/stale shape as `ClaudeUsageService`
- [x] 1.3 `GET /api/codex-usage`; `GET /api/codex-account` carries the identity fields; DI
- [x] 1.4 `AccountChips.jsx`: Codex chip shows account · plan, plan/subscription/login rows, usage meters + credits; i18n en/tr

## 2. OpenAI models in the model picker

- [x] 2.1 `models.js`: two engine families, `providerOf` / `defaultModelFor` / `effectiveModelFor` / `codexModels` / `prettyModel` (pure, node-tested)
- [x] 2.2 Codex family driven by the account's real `model_usage` (fallback to the CLI default); never offers a slug that 401s
- [x] 2.3 `ModelSelector.jsx`: grouped dropdown, account-driven codex options
- [x] 2.4 `ChatContext.jsx`: the composer shows the effective model for the active repo; a cross-family pick flips the repo's Engine (optimistic, no flicker) and the send carries model + provider
- [x] 2.5 `AgentProviders.ProviderOfModel` / `ModelBelongsTo`; `ChatController` drops a model from the other engine's family
- [x] 2.6 Fix the provider route: dock selector + picker POST `/api/repos/{id}/provider` (was the singular `/api/repo/...`, a silent 405)

## 3. Prove it

- [x] 3.1 `CodexAccountTests` (usage parse of the real body, identity from claims with no secret leak, plan labels, model→engine mapping + guard)
- [x] 3.2 `models.test.mjs` (engine mapping, effective model, account-driven codex list, prettifier)
- [x] 3.3 `codex-account-models-e2e.ps1` + `check-codex-account-models.mjs`: isolated instance, real login — chip identity + usage + no secret, two-family picker, Engine flip both ways, a real `gpt-6-astra` turn, the mismatch guard (19/19)
- [x] 3.4 `dotnet test` 452/452 (bar the load-sensitive scoreboard benchmark, green standalone); client 67/67
