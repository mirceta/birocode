# Design: add-host-event-sound-rules

## Context

`HostEventSound` plays a fixed, event-determined cue on the host (Windows system sounds in
`beep` mode, SAPI speech in `voice` mode), gated by a persisted on/off toggle and debounced in
`Notify`. Custom audio exists only in the browser layer (events-app IndexedDB) and never
reaches the host. The Sounds tab reserves a "Event → sound rules — coming soon" panel.
This change makes the host cue table-driven: per-type custom audio files, stored host-side.

Constraint: the repo avoids NuGet/audio dependencies — existing host audio uses
`System.Media.SystemSounds` and COM SAPI, all best-effort. The events-app is build-less and
talks to `/api/collector/*` with relative-path-safe fetches.

## Goals / Non-Goals

**Goals:**
- Operator uploads a `.wav`/`.mp3` per slot (`turn.start`, `turn.ended`, `_default`);
  matching events play that file on the host, beating beep/voice modes.
- Files persist in the data dir across restarts; absent files = today's behavior exactly.
- Rules API (list / upload / clear / per-slot host test) + real Sounds-tab panel.

**Non-Goals:**
- Per-**source** rules (the "per source" half of the placeholder) — the table is keyed by
  type only; per-source is a follow-up.
- No change to the browser/device sound layer, the on/off toggle, modes, or debounce.
- No audio transcoding/validation beyond extension + size cap — playback is best-effort
  with fallback, like every other host-audio path.

## Decisions

- **Playback: `winmm.dll` MCI (`mciSendString`) for both wav and mp3.** Rationale: zero
  dependencies (P/Invoke to an inbox Windows DLL, consistent with the SAPI-via-COM choice);
  `System.Media.SoundPlayer` handles only wav; NAudio would add a package for one call. Open
  with a unique alias, `play … wait` on the existing background `Task.Run`, `close` in
  `finally`; any MCI error returns false → caller falls back to the built-in cue. The
  existing `MinGapMs` debounce already prevents overlapping bursts.
- **Storage: files under `DataDir/collector-host-cues/`**, named `<slot>.<ext>` with the
  slot key sanitized by allowlist (only the three known slots are accepted, so no path
  concerns) plus a `<slot>.name` sidecar holding the original filename for display.
  Rationale: mirrors the existing one-value-per-file persistence style
  (`collector-host-sound`, `collector-host-sound-mode`); no JSON registry to migrate.
- **Precedence mirrors the browser's `playCue`**: `custom[type]` → built-in cue for type;
  unknown types: `custom[_default]` → built-in generic. Custom beats `voice` too — an
  explicit per-type assignment is a stronger operator intent than the global mode.
- **Upload transport: raw request body** (`POST api/collector/sound/rules/{slot}` with the
  audio bytes, original name via `?name=` query), capped at 2 MB via a manual bounded read.
  Rationale: the events-app already has an `ArrayBuffer`; raw body avoids multipart parsing
  and the proxy's known content-length traps. Extension check on the supplied name
  (`.wav`/`.mp3`); bytes are stored as-is.
- **API shape** (all behind the usual session auth, mutating only harness-local state):
  - `GET  api/collector/sound/rules` → `{ rules: [{ slot, hasCustom, fileName }] }`
  - `POST api/collector/sound/rules/{slot}?name=<orig>` (body = bytes) → updated rule
  - `DELETE api/collector/sound/rules/{slot}` → updated rule
  - `POST api/collector/sound/rules/{slot}/test` → plays the effective cue now (ignores toggle)
- **`HostEventSound` owns the table** (load on construction, mutate under a lock, volatile
  read in the play path) rather than a separate service — it is small, and the play path
  needs it on every event.

## Risks / Trade-offs

- [MCI is Windows-only] → so are `SystemSounds`/SAPI already; the whole class is
  best-effort and the harness is a WinForms app.
- [Stored bytes are unvalidated audio] → only authenticated operators can upload; playback
  failure falls back to the built-in cue (spec scenario); size cap bounds disk use.
- [`play … wait` holds a background thread for the clip length] → debounce keeps
  concurrency ≈1; clips are ≤2 MB (~seconds). Acceptable.
- [Two unarchived changes touch the same requirement] → archive
  `add-host-event-determined-cue` before this change so deltas fold in order.

## Migration Plan

Pure addition: no config migration; missing rule files reproduce today's behavior. Deploy
via the standard `swap.ps1` flow. Rollback = previous build; stray `collector-host-cues/`
files are inert to old builds.

## Open Questions

- None blocking. ("Reply sounds" for events and per-source rules stay future headroom, as
  the placeholder text says.)
