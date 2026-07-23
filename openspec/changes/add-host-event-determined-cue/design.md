## Context

`HostEventSound` fires one cue per ingested event via `Notify(sourceLabel)`, debounced, on a
background thread. It has two modes: `beep` (`SystemSounds.Asterisk`, falling back to
`Console.Beep`) and `voice` (SAPI speaks `PhraseFor(label)`). The Device cue in `events-app`
already maps `type -> motif`; the host does not see the type at all.

## Goals

- Host cue distinguishes `turn.start` / `turn.ended` / other, in both modes.
- Operator can audition beep and voice independently.
- No regression to debounce, best-effort fallback, persistence, or the existing API contract.

## Decisions

### 1. Pass the event `type` into `Notify`

`Append` already knows `type`; thread it through as `Notify(sourceLabel, type)`. Keeps the
type-selection logic server-side and lets the debounce/threading stay exactly as-is.

### 2. Beep = distinct **SystemSounds** per type (audible), motif only as fallback

The existing code prefers `SystemSounds.Asterisk` precisely because it routes through the
default audio device and is actually audible, whereas `Console.Beep` is the legacy PC-speaker
tone that many machines cannot sound. To stay audible while still being event-determined, map:

- `turn.start` -> `SystemSounds.Asterisk`
- `turn.ended` -> `SystemSounds.Exclamation`
- other/unknown -> `SystemSounds.Beep`

with a type-shaped `Console.Beep` motif (rising for start, resolving for finish, flat otherwise)
as the fallback only. Distinct-and-audible beats musically-faithful-but-often-silent.

### 3. Voice = phrase reflects the event

`PhraseFor(label, type)`: `turn.start` -> "agent {label} started"; `turn.ended` ->
"agent {label} has finished" (unchanged wording, preserving `name-source-in-host-voice`); other
-> "agent {label} sent an event". `label` blank -> "an agent". Fixes the current bug where a
`turn.start` wrongly says "has finished".

### 4. Test accepts an explicit mode; default stays current mode

`PlayNow(string? mode)` plays in `mode` when it is a valid mode, else the persisted mode. The
test uses a `turn.ended` cue as the representative "finished" sound (so voice says the canonical
phrase). `POST /api/collector/sound/test` reads an optional `{ "mode": "beep" | "voice" }`;
an empty body keeps the old behaviour (current mode), so the endpoint is back-compatible.

### 5. UI: state-labeled buttons become labeled settings; one test becomes two

`hsnd` -> "Host cue: On/Off"; `hmode` -> "Live sound: Beep/Voice"; replace `htest` with
`htestb` (Test beep) and `htestv` (Test voice), each POSTing `{mode}`. Pure `events-app`
markup + handler wiring; no proxy/serving change.

## Risks

- `SystemSounds.Exclamation`/`Beep` default to distinct wavs but an operator can remap them in
  Windows; they could sound alike. Acceptable — it degrades to "still audible, less distinct",
  never to silence, and voice mode remains unambiguous.
