## 1. Build

- [x] 1.1 `AppConfig.ArchModel` (default `claude-fable-5-1`), `ArchAgentService.DefaultModel` / `ResolveModel` / `Model`.
- [x] 1.2 Both arch turn sites pass the model (Operator send, loop-driven wake); `GET /api/arch` reports it.
- [x] 1.3 `docs/agents.md` names the model rule.

## 2. Verify

- [x] 2.1 xunit: the default, the override rule (Claude id honoured, blank / non-Claude falls back), the adapter's argv carries `--model claude-fable-5-1`.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
