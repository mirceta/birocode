## Design

**D1 — a harness setting, not a registry entry.** The arch home is not a registered
repo by design (openspec add-arch-agent D3), so its model cannot live where the repo
agents' does. It lives in `AppConfig` beside `ArchHomeDir`, the arch's other
harness-level setting.

**D2 — the default must carry the fix.** `swap.ps1` preserves the live box's
`appsettings.json` across deploys, so a committed key alone would never reach a live
harness. The property's default is `claude-fable-5-1`; the committed appsettings names it
too, for discoverability only.

**D3 — resolved at turn time.** `ArchAgentService.Model` reads the config on every turn
(no caching), and passes it explicitly at both call sites rather than teaching the
runner about the arch key — the runner stays provider-neutral and repo-keyed.

**D4 — Claude only.** `ResolveModel` accepts a `claude-*` id and falls back otherwise: the
arch's tools, fence and session ownership are all Claude-shaped, and the runner would
drop a foreign-family model anyway (`AgentProviders.ModelBelongsTo`).

**Verifying on a live harness.** `GET /api/arch` → `model`; the Monitoring call log's
command line for an arch turn shows `--model claude-fable-5-1`; the call record's
`Model` (read from the CLI's init event) names the model that actually answered.
