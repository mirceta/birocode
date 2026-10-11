# DRAFT — hub sofa viewer: see (later drive) the whole fleet from the living-room sofa, through the hub

> Analysis for fleet task 5afbb125 (2026-10-10). **Not approved, nothing built.** The reasoning and
> the options are rendered in the Understanding app of the hub's birocode agent
> (`understanding-app/` on branch `analysis/hub-living-room-bridge`); this file is the proposal
> the Operator can approve, amend or discard.

## Why

The living-room PC drives the projector; sofa mode (openspec `sofa-mode`, PR #164 + #167) makes
the phone a remote for the harness **on that PC**, so the sofa sees that PC's seven agents. The
Operator wants to see every agent the hub's arch sees, and later to type to them, and names the
constraint: *very protected*. Moving the hub is not an option.

## What the code says (verified 2026-10-10)

- Pairing a phone (`POST /api/remote/pair`, PIN from the big screen) mints **the same 30-day session
  a password login gets** — full `/api` power on that harness.
- A peer's describe (`GET /api/arch/peer`) lists only that peer's own repos; the fleet view exists
  only as the hub's `GET /api/arch/fleet/status`. The hub reaches a remote agent's transcript only
  for the arch (`FleetClient.ReadTranscript`); no dashboard view shows it.
- The fleet channel authenticates with each peer's **admin password** in `X-Auth-Password` over
  plain HTTP on the LAN; writes are gated by the peer's opt-ins (accept sends / upgrades /
  provisioning, default off).
- The hub admits 192.168.0.0/24 by LAN bypass and single guest IPs; the living room is on
  192.168.1.x. Everything in the house is HTTP.
- The living-room leg of card 68090860 (WebView2 presenter, daljinski Harness tab) is still todo.

## Options considered

A · the living-room harness subscribes to the hub and proxies a fleet view — credential sprawl
(eight admin passwords on the living-room PC), a second hub with the same powers; not first.
B · the projector shows the hub's dashboard and the phone pairs with the hub — the right shape,
but the paired phone is an admin and the projector holds an admin login; only together with C.
**C · a scoped viewer on the hub (recommended)** — below.
D · remote desktop of the hub — no scoping at all; reject.
E · hygiene: per-peer scoped tokens instead of admin passwords on the fleet channel; shorter paired
sessions; optional encrypted overlay between the segments — do alongside / before M2.

## What would change (C, phased)

### M1 — view-only fleet on the projector (hub only)

1. **Viewer session kind.** `AuthService.CreateSession(kind: "viewer")`, minted only by a PIN the
   big screen's menu created as *"Pair a sofa viewer"*. Lifetime 24 h; listed and revocable in
   Settings → Sofa.
2. **Allowlist middleware.** A viewer session may call only: `GET /api/arch/fleet/status` (viewer
   projection), `GET /api/dock`, `GET /api/arch/fleet/transcript?sourceId&repoId&tail`,
   `GET/POST /api/remote/commands`, `GET/POST /api/remote/screens`, `GET /api/auth/check`. Every
   other `/api` route answers 403 `viewer-session`. Unit-tested as a table.
3. **Opt-in gate.** `ArchStateStore.AcceptSofaViewers` (default off) next to accept-sends: off → the
   PIN menu item is absent and viewer sessions are refused.
4. **LAN-only.** Viewer sessions are refused when the resolved client IP is not in the LAN bypass
   ranges or an approved guest — even through the trusted proxy.
5. **Viewer projection of the fleet status.** Machines and agents with state (free / occupied /
   running / finished, branch, last actor) — without the account overview, plan usage, peer
   addresses, versions' build hashes or credentials.
6. **Transcript relay.** `GET /api/arch/fleet/transcript` → local repo: `SessionService`; remote:
   `FleetClient.ReadTranscript` (the arch's existing path), only for agents the hub manages;
   scrubbed; rate-limited per session.
7. **Fleet reader big screen.** A hub page `/studio/fleet?screen=projector` (or the Management
   App's Status tab + a transcript pane) that the existing listener drives; `/remote` lists fleet
   agents grouped by machine and `open-agent` accepts `sourceId|repoId`.
8. **Audit + limits.** Every viewer call logged with device and route (`AutopilotAuditLog`);
   brute-force throttle on pairing as today.

### M1b — the room (no code)

The projector browser (or, later, the WebView2 presenter of card 68090860) points at the hub's
Fleet reader as a viewer; the living-room PC and the sofa phone are admitted as guests or by the
trusted-device cookie minted at pairing — never the 192.168.1.0/24 range.

### M2 — guarded actions (later, own change)

A second gate *"sofa may send prompts"* with a per-agent allowlist; a send goes through the hub's
own send path (the peer's accept-sends, claims and occupancy respected), is audited and shown on
the projector; never deploy, upgrade, provision, settings or request approval from a viewer
session. Precondition: E (per-peer scoped tokens).

## Open questions for the Operator

See the Understanding app, tab 5 — eight questions on internet exposure, the two segments,
projector-direct vs via the living room, what a viewer may see, session life, M2 scope, the
living-room leg's timing, and E as its own card.
