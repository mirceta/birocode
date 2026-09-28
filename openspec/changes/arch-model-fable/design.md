## Design

**D1 — the same picker, the same shape.** The repo agents' model is a per-repo record the
dock's `ModelSelector` writes through one POST. The arch home is not a registered repo by
design (openspec add-arch-agent D3), so its counterpart is a field in the arch state store
(`arch-state.json`, beside the claim window and the driven quiet floor) written through
`POST /api/arch/model`. The Arch tab mounts the very same component in its composer row.

**D2 — the default carries the fix.** A store with no pick resolves to `claude-fable-5-1`,
so every existing harness upgrades onto Fable without anyone touching the picker. No
appsettings key: one settable place, as for the repo agents.

**D3 — resolved at turn time.** `ArchAgentService.Model` reads the store on every turn and
is passed explicitly at both call sites rather than teaching the runner about the arch key
— the runner stays provider-neutral and repo-keyed.

**D4 — Claude only.** The dock's picker offers both families because a repo can switch
engine; the arch cannot (its tools, fence and session ownership are Claude-shaped). A Codex
pick is refused with 400 and the current model; the controlled select snaps back and the
refusal shows as the page's error banner.

**D5 — one model for every arch conversation.** Conversations share the home, the tools
and the fence; they share the model too.

**Verifying on a live harness.** The picker in the Arch tab's composer row shows the model;
`GET /api/arch` → `model`; the Monitoring call log's command line for an arch turn shows
`--model claude-fable-5-1`; the call record's `Model` (read from the CLI's init event) names
the model that actually answered.
