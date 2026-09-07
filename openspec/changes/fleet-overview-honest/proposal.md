# Fleet Status Overview + status strip: honest, complete, readable

## Why

The Fleet Status → Overview tab was meant to show, per computer, what the harness's
own header status strip shows. It did not: the strip's Claude chip shows the plan's
**usage** (the 5-hour window, the weekly quota, per-model weekly limits, stale /
unavailable), the host clock shows the **time**, the admin tile rests on two facts
(UAC policy set, harness elevated) — none of that reached the Overview, and a machine
whose overview was missing showed a bare "n/a" that reads like "nothing there" rather
than "not known". Worse, the Overview was rendered with theme tokens that were never
defined, so it fell back to dark-theme greys on the light page: labels at 2.5:1 and
values at 1.25:1 contrast — unreadable.

## What changes

- **One record, complete.** `FleetOverview` — produced by every harness for its own
  describe and read by the hub — now carries everything the strip shows: the Claude
  account with plan **and usage** (5-hour, weekly, per-model, stale, unavailable with
  the reason), the GitHub account, the host **clock** (time, zone, offset), the admin
  state **with its two facts**, and `capturedAt`. A peer's values come from that
  peer's own probes through its describe; nothing is fabricated.
- **One renderer.** `overviewGroups` (pure) maps the record to grouped rows — Harness,
  Host, Accounts, Claude plan usage, Fleet posture — with every unavailable value spelled
  out as `unknown — <reason>` (machine not reachable, build reports no overview, build
  predates this field, not probed yet, no session, unavailable — probe error). The Fleet
  Status Overview tab and a new **Machine tile in the header strip** (this machine as
  the fleet sees it, from `GET /api/arch/overview`) render the same rows.
- **The audit, executable.** `STRIP_FIELDS` lists every fact the strip shows and the
  Overview row that carries it; a unit test asserts the mapping. The Scoreboard is the
  one documented exception — it is the Fleet Status Scoreboard tab, fetched on demand.
- **Readable.** The Management theme tokens are defined for light and dark schemes, a
  `--color-text-muted` token replaces the undefined one the strip's sections fell back
  from (#999 / #9aa, ~2.7:1), and the overview rows get a proper card design: dark
  labels and values (≥ 6:1), toned values (ok / warn / bad), dark-amber italic unknowns,
  usage meters with captions.

## Non-goals

No change to the strip's existing chips' behaviour; the scoreboard stays out of the
fleet poll.
