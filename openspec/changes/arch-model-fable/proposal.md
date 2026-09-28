# The arch agent runs on Fable 5.1, picked the way a repo agent's model is

## Why

Fleet task 4e9f50be (the Operator, 2026-09-28): the arch / management agent was running
on Opus 4.8 (`claude-opus-4-8`); it must run on Fable 5.1 (`claude-fable-5-1`). And the
Operator's follow-up: set it the same way the repo agents' docks do — the model combo box.

## What the code did (verified)

No arch turn ever carried a model. Both arch turn sites — the Operator's send
(`ArchAgentService.SendToArch`) and the loop-driven wake (`AutopilotService`, the
arch-home branch of the loop send) — called the runner without `model:`. The runner's
only fallback is the per-repo model of a *registered* repo (`model ??= repo.Model`), and
the arch home is deliberately not one, so the Claude adapter added no `--model` flag and
the CLI ran its own default. This box's `~/.claude/settings.json` sets no model either,
so that default — Opus 4.8 on the installed CLI — is what the arch got. Nothing was
"set to Opus" anywhere; the model was simply never chosen.

How a repo agent's model is chosen: the dock's composer row has `ModelSelector`; a pick
calls `POST /api/repos/{id}/provider { provider, model }`, the registry stores it on the
repo (`RepositoryConfig.Model`), and the runner passes it as `--model` on every turn.

## What changes

- The arch gets the same: the Arch tab's composer row carries the dock's own
  `ModelSelector`, preselected with the arch's model; a pick posts to
  `POST /api/arch/model { model }`, kept in the arch state store (`Model`, shared by every
  arch conversation) — the arch's counterpart of the repo's per-repo model.
- `ArchAgentService.DefaultModel = "claude-fable-5-1"`; `ResolveModel` (a `claude-*` pick
  as is, else the default); `Model`; `SetModel` refuses a non-Claude pick (the arch only
  runs on Claude — the dock's picker offers Codex too, the server says no).
- Both arch turn sites pass `model: Model`, so the adapter emits `--model <pick>`.
- `GET /api/arch` reports `model`, so the choice is verifiable without reading a log.
- Repo agents are untouched: their model stays the registry's per-repo `Model`.

## Impact

Backend: one store field + setter, one constant + resolver + setter, one endpoint, two call
sites, one field on the arch state. Client: the existing picker mounted once more.
