# Design — honest, complete, readable fleet overview

## D1. The audit

The header strip hosts four sections; the facts they show and where each now lives:

| Strip section | Facts | Overview row(s) |
|---|---|---|
| GitHub chip | installed, authenticated, account, host | GitHub, GitHub host |
| Claude chip | installed, logged in, account, plan | Claude, Claude plan |
| Claude chip (expanded) | 5-hour window %, resets; weekly %, resets; per-model weekly; stale; unavailable | 5-hour window, Weekly quota, Weekly · model, Usage freshness |
| Host clock | time + offset, date, timezone, stale | Host time, Date, Timezone (freshness via "Overview as of") |
| Admin tile | state; behind it: UAC policy set, token elevated | Admin active, UAC policy set, Harness elevated |
| Strip bar | harness build | Version, Build |
| Scoreboard | prompts, peak, longest, work, cost, activity, agents | Fleet Status → Scoreboard tab (on demand; never on the poll) |

`STRIP_FIELDS` in `fleetStatusTabs.js` is this table; a test asserts every row exists.

## D2. One record

`FleetOverview` grows `capturedAt`, `Claude.Usage` (`OverviewUsage`: available, stale,
fetchedAt, session / weekly / scopedWeekly limits with percent, resetsAt, severity,
error), `Host.NowUnixMs` / `NowIso`, `Admin.RegistrySet` / `Elevated`. All trailing
and nullable: a peer that predates a field sends none of it, the hub's deserialised
record holds null, and the UI says "unknown — this machine's build predates this
field". The provider builds usage from `ClaudeUsageService` in its existing background
build (the usage probe is cached for minutes; the describe stays non-blocking) and only
for an authenticated session; a failed probe becomes `available: false` with the
probe's error — honest, not blank.

## D3. One renderer, explicit unknowns

`overviewGroups(overview, machine, now)` returns five groups of `{ label, value, tone,
kind?, percent? }`. The reason a value is unknown is decided once:
- no overview and the machine is unreachable → "unknown — machine not reachable (status: detail)";
- no overview on a reachable machine → "unknown — this machine's build reports no overview";
- overview present but a sub-object null → "unknown — not probed yet" (cold cache);
- a field missing inside a present sub-object → "unknown — this machine's build predates this field";
- usage on an unauthenticated session → "no session — sign in to see usage";
- usage probe failed → "unavailable — <error>" (tone bad).
Tones: ok / warn / bad / muted / unknown; `kind: 'meter'` rows carry `percent`.

## D4. Two surfaces, one source

- Fleet Status → Overview renders `overviewGroups(machine.overview, machine)` for every
  machine (the hub's fleet status, whose per-peer overview is that peer's describe).
- The header strip gains a **Machine tile**: `GET /api/arch/overview` returns this
  machine's fleet identity plus `_overview.Current()` — the identical record the
  describe carries — rendered with the same `OverviewGroups` component. Collapsed it is
  a one-line summary ("Max · 5h 23% · week 61% · 12:30 UTC+2 · admin active"); expanded,
  the grouped rows, headed "As the fleet sees it". It polls every 30 s while the strip
  is expanded (the strip unmounts it when collapsed, as it does the other sections).
  The existing chips stay: they are the interactive controls (token control, admin
  enable); the tile is the honest mirror of what the fleet reads.

## D5. Readability

- `global.css` defines `--color-text-muted: #5b5b57` (6.6:1 on white; the strip's
  scoreboard and Fleet Status sheets used the token undefined, falling back to #999 /
  #9aa at ~2.7:1).
- `manage.css` defines the `--mg-*` tokens for light (page text, muted, border, accent,
  surface) and dark schemes; the Fleet Status tabs resolve to them.
- `fleetOverview.css` (imported by both surfaces): surface cards with a shadow, bold
  titles in the page text colour, labels in the muted token, monospace values in the
  text colour, tone colours chosen at ≥ 4.5:1 on white (ok #1f6b2f, warn #8a5a0f, bad
  #a12b1f, unknown #7a4a12) and on the dark surface (light variants), meters as a bar
  with a caption. Measured on the isolated instance: labels 2.54 → ≥ 6, values 1.25 → ≥ 12.

## D6. Tests

C#: the describe round-trips usage / clock / admin facts / capturedAt; a pre-change peer
leaves the new fields null; `MapUsage` maps one-to-one incl. an honest failure; the
poll payload still carries no scoreboard field. JS: the honest overview rows (meters,
tones, host clock in the peer's zone, admin facts, freshness, posture, summary); the
unknown reasons (old build, unreachable, cold, predates, no session, unavailable); the
strip-field parity; `hostClock` / `resetLabel`. Browser: before/after screenshots and
computed contrast of the Overview and the strip.
