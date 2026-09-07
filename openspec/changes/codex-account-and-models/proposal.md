# Codex account chip + OpenAI models in the model picker

## Why

The dashboard status strip has a Claude chip (who you are logged in as, plan, live usage)
and the chat composer has a model picker — both Claude-only. Now that the harness runs a
codex provider (openspec `provider-agnostic-runner`, `codex-real-run`), the Operator needs
the same for Codex: is the CLI logged in, as whom, on what plan, with what limits; and the
model picker must let a repo agent run on an OpenAI/Codex model, not just an Anthropic one.

## What Changes

- **Codex account chip**, the Claude chip's twin, in the header status strip: account
  email, display name, ChatGPT plan and subscription end (read from the login's own id
  token claims, claims only — no token value ever leaves the probe), login method, and
  live plan usage (the 5-hour / weekly windows, per-model limits and credits from the
  ChatGPT backend usage endpoint). `GET /api/codex-account` gains identity; new
  `GET /api/codex-usage`.
- **Two-family model picker**: the composer dropdown groups Anthropic (Claude) and OpenAI
  (Codex) models. The Codex family is the models THIS account may actually run — read from
  the account's own `model_usage` (a guessed slug 401s at turn time; verified that only
  `gpt-6-astra` runs on a Pro-lite plan) — falling back to the CLI default. Picking a
  model implies its engine: choosing an OpenAI model switches the repo's Engine to codex,
  choosing a Claude model switches it back, so the picker and the dock's Engine select
  always agree. The chosen model is sent only to its own engine; a mismatched model is
  dropped server-side so a stale client can never hand one CLI the other's `--model`.
- **Fix**: the per-repo Engine control posted to `/api/repo/{id}/provider` (singular) while
  the route is `/api/repos/{id}/provider` — a silent 405. Both the dock selector and the
  new picker now use the correct path, so changing the engine from the UI actually persists.

## Impact

- Code: `CodexAccountService` (identity from id-token claims + plan label), new
  `CodexUsageService`, `AccountsController` (`/api/codex-usage`), `AccountsModuleExtensions`,
  `AgentProviders.ProviderOfModel/ModelBelongsTo`, `ChatController` (drop a mismatched
  model), `client/src/components/chat/models.js` (catalogue + engine mapping),
  `ModelSelector.jsx` (grouped, account-driven codex list), `ChatContext.jsx` (effective
  model per repo, cross-family pick flips the engine, correct route), `AccountChips.jsx`
  (Codex chip = identity + usage), `PinnedAgent.jsx` (correct provider route), i18n.
- Specs: `codex-credentials` (account identity + usage), `chat` (model↔engine coupling).
- Not in scope: an OpenAI **API-key** login's usage (the ChatGPT usage endpoint is
  ChatGPT-plan only); reasoning-effort selection.
