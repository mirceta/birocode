# The arch agent runs on Fable 5.1

## Why

Fleet task 4e9f50be (the Operator, 2026-09-28): the arch / management agent was running
on Opus 4.8 (`claude-opus-4-8`); it must run on Fable 5.1 (`claude-fable-5-1`).

## What the code did (verified)

No arch turn ever carried a model. Both arch turn sites — the Operator's send
(`ArchAgentService.SendToArch`) and the loop-driven wake (`AutopilotService`, the
arch-home branch of the loop send) — called the runner without `model:`. The runner's
only fallback is the per-repo model of a *registered* repo (`model ??= repo.Model`), and
the arch home is deliberately not one, so the Claude adapter added no `--model` flag and
the CLI ran its own default. This box's `~/.claude/settings.json` sets no model either,
so that default — Opus 4.8 on the installed CLI — is what the arch got. Nothing was
"set to Opus" anywhere; the model was simply never chosen.

## What changes

- `AppConfig.ArchModel` (appsettings.json, env `CLAUDEWEB_ARCHMODEL`), default
  `claude-fable-5-1`. Operator-settable to any other `claude-*` id; blank or a
  non-Claude model falls back to the default (the arch only ever runs on Claude).
- `ArchAgentService.DefaultModel` / `ResolveModel` / `Model`; both arch turn sites pass
  `model: Model`, so the adapter emits `--model claude-fable-5-1`.
- `GET /api/arch` reports `model`, so the choice is verifiable without reading a log.
- Repo agents are untouched: their model stays the registry's per-repo `Model`.

## Impact

Backend only: one config property, one constant + resolver, two call sites, one field
on the arch state. Tests pin the default, the override rule and the argv.
