# Arch-orchestrated peer upgrades

## Why

Three times this week the operator upgraded a peer harness by hand: merge on
GitHub, pull on the peer, run its deploy, add a config line, say keep it. The
arch agent already sees each peer's build version in the peer describe
(`version`), already knows the hub's own version, and already has a channel to
every peer. It should notice drift and drive the upgrade — or at least run it on
request — instead of the operator doing it box by box.

## What changes

1. **Peer API**: `POST /api/arch/peer/upgrade` on every harness. Behind the
   normal password middleware AND a new receiver opt-in **accept fleet
   upgrades** (persisted beside "accept fleet sends"). It runs the peer's own
   committed `swap.ps1` detached (guarded, staged-before-stop, dead-man switch
   armed) after `git fetch` + checkout of the requested ref (default: the
   caller's `origin/main` commit). The response is a job id; `GET
   /api/arch/peer/upgrade/{id}` reports the deploy log tail and outcome.
2. **Keep policy**: the peer disarms its own dead-man switch automatically when
   its health check passes AND the caller's arch agent confirms the peer describe
   reports the new version within the window; otherwise the switch fires and the
   peer restores last-good — the same safety the operator has today.
3. **Arch tool** `upgrade_peer(machine, ref?)` — refuses unless the loop is
   armed, the source allows sends, the peer accepts upgrades, and the peer's
   version differs from the requested ref. Audited like a send.
4. **Version drift surfaced**: `list_machines` and the Fleet card show each
   peer's version against the hub's and flag drift; the wake briefing mentions it.
5. **Config-key carry**: the upgrade job copies any missing `appsettings.json`
   keys the new build's template declares (e.g. `LanBypassCidrs`) into the peer's
   preserved live config with the template's default, so a new setting does not
   need a hand edit on every box.

## Impact

Server: `ArchController` (peer upgrade endpoints), `ArchAgentService` (tool,
posture), `ArchStateStore` (opt-in), `FleetClient` (upgrade call), a small
`PeerUpgradeService` (job runner around swap.ps1). Client: Fleet card opt-in +
drift chips. Specs: `arch-agent` (ADDED requirements), `deploy` (MODIFIED:
remote-triggered deploy path). Requires deploying both boxes once by hand — the
last time.
