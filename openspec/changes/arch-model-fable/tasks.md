## 1. Build

- [x] 1.1 `ArchStateStore.Model` / `SetModel`; `ArchAgentService.DefaultModel` / `ResolveModel` / `Model` / `SetModel`.
- [x] 1.2 Both arch turn sites pass the model (Operator send, loop-driven wake); `GET /api/arch` reports it; `POST /api/arch/model` sets it.
- [x] 1.3 The Arch tab's composer row mounts the dock's `ModelSelector`, posting to the arch endpoint.
- [x] 1.4 `docs/agents.md` names the model rule.

## 2. Verify

- [x] 2.1 xunit: the default, the pick persists and blank resets, the override rule (Claude id honoured, blank / non-Claude falls back), the adapter's argv carries `--model claude-fable-5-1`.
- [x] 2.2 UI: the picker sits in the Arch composer row with the dock's two families, a Claude pick posts and sticks, a Codex pick is refused and the select snaps back (`shot-arch-model-picker.mjs`).

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
