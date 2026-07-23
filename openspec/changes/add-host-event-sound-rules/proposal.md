# Proposal: add-host-event-sound-rules

## Why

The host cue is event-determined but **fixed**: the operator can only pick beep vs voice,
never *which sound* plays — while the Sounds tab's custom-audio grid creates the (reasonable)
expectation that an uploaded sound will play on events. Today custom audio reaches only the
browser layer; the host plays hard-coded Windows sounds/phrases. The Sounds tab already
reserves a "🔗 Event → sound rules — coming soon" panel for exactly this gap, and the user has
explicitly asked for it: *assign a custom sound per event type and have the host play it when
that event arrives.*

## What Changes

- **Host-side event → sound rules**: for each recognized event-type slot (`turn.start`,
  `turn.ended`, `_default` — the same taxonomy as the browser's custom-sound grid) the
  operator can upload an audio file (wav/mp3) that is stored **host-side** under the
  harness data dir and **plays on the host computer** when a matching event is ingested
  (host cue toggle still gates live playback).
- **Precedence**: a slot's custom file wins over both `beep` and `voice` modes for that
  event type; slots without a file keep the current mode-determined built-in cue. Unknown
  event types use the `_default` custom file when present, else the built-in generic cue.
- **Rules API** under the collector: list rules, upload/replace a slot's file, clear a slot,
  and a per-slot test that plays on the host exactly what a live event of that type would play.
- **events-app UI**: the "Event → sound rules — coming soon" placeholder becomes the real
  panel — one row per slot showing the effective host sound (custom file name or "built-in"),
  with Upload / ▸ Test on host / Clear.
- Upload constraints: `.wav`/`.mp3`, capped size (2 MB), stored as plain files; playback is
  best-effort like every other host-audio path (a failing file falls back to the built-in cue).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `event-feed-collector`: the "Optional audible host-side sound on new events" requirement
  gains an operator-editable event → sound table: per-type custom audio stored host-side,
  its precedence over the beep/voice modes, management endpoints, and per-slot host test.

## Impact

- **Depends on**: `add-host-event-determined-cue` (complete, unarchived) — this delta
  modifies the requirement text that change introduced; archive it first (or together,
  in order) so the baselines fold cleanly.
- `ClaudeWeb.App/Services/Events/HostEventSound.cs` — rule store (files under
  `DataDir/collector-host-cues/`), custom-file playback (MCI/winmm, no new dependency),
  precedence in `Play`.
- `ClaudeWeb.App/Controllers/CollectorController.cs` — `GET/POST/DELETE` under
  `api/collector/sound/rules` + per-slot test endpoint.
- `events-app/index.html` — replace the placeholder panel with the rules UI (relative
  URLs, build-less, same-page fetches to the collector API).
- No schema/config migration; absent rule files simply mean "built-in", so existing
  installs behave exactly as before until a file is uploaded.
