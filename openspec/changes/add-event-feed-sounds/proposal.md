## Why

The event feed has two sound layers, and both play the **same cue on every event**:

- the **Device** cue in the events-app (`events-app/index.html`) — one synthesized triangle
  "blip" on every event, per-browser toggle;
- the **Host** cue (`HostEventSound.cs`) — a beep or a spoken phrase, shared, operator toggle.

Neither branches on the event `type`, even though the feed already carries two types
(`turn.start`, `turn.ended`) and the envelope is explicitly the extension point for more. So an
operator listening can't tell *what* happened — an agent starting sounds identical to one
finishing — and the cue is a flat blip rather than something characterful. The operator's ask:
make the per-turn sound **more interesting**, and give **different events different sounds**.

## What Changes

- The **Device** cue becomes **per-event-type**: instead of one `blip()`, the events-app looks
  up a distinct synthesized motif by event `type` — a bright **rising** motif for `turn.start`,
  a warm **resolving** motif for `turn.ended` — with a generic fallback for any unknown type, so
  a new `type` still makes a sound without code changes.
- The built-in motifs carry an **"AoM-spirit" flavour** — short, snappy, playful
  RTS-unit-acknowledgement-style cues. See the copyright note under Impact: these are
  *original synthesized* cues, **not** Age of Mythology's actual (copyrighted) audio, and no
  audio files are vendored — everything is Web-Audio-synthesized, keeping the app build-less.
- **Bring-your-own audio (device-local):** the user can assign their **own** audio file per event
  `type` via a `🎵 Sounds` panel. Files are stored in the browser (**IndexedDB**) — never uploaded,
  never committed — and a custom file overrides the built-in synth cue for that type; clearing it
  reverts to synthesis. This is the direct answer to the AoM wish for a personal, at-home harness:
  drop the *actual* game sounds in yourself. The repo still ships **no** audio, so it stays build-less.
- The single existing per-device Device toggle and its user-gesture audio-unlock are unchanged;
  turning sound off stays fully silent, and custom files play through the same gated `audioCtx`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `harness-event-feed`: the "In-repo consumer app observes the collector" area gains two
  requirements — **per-event-type Device sound cues** (the consumer app synthesizes a distinct
  cue per event `type` with a generic fallback, AoM-spirit flavour, no vendored audio) and
  **user-supplied per-event-type audio** (assign your own file per type, stored device-local in
  IndexedDB, overriding the synth cue; never uploaded or committed).

## Impact

- **Frontend only:** `events-app/index.html` — replace the single `blip()` with a
  `SOUNDS[type]` motif lookup driven by a tiny `playMotif(notes)` primitive (a superset of
  today's blip), plus a device-local IndexedDB store + `🎵 Sounds` panel for custom per-type
  files, dispatched by `playCue(type)`. No backend change.
- **Scope — personal use:** this harness runs only for its operator at home (not sold, not
  distributed), which collapses the copyright concern the synth-homage was working around: the
  built-in cues stay original synthesis (the *repo* vendors nothing), while any third-party audio
  the user wants lives only in their own browser via the upload path.
- **Descoped:** the originally-planned multi-**theme** picker (`events_sound_theme`) is dropped —
  one built-in per-type cue set plus custom uploads covers a single user (see design.md decision 6).
- **Out of scope — Host cue:** the Host layer's type-branching is intentionally left out to
  avoid colliding with the in-flight change **`name-source-in-host-voice`** (9/10 tasks), which
  is actively editing `HostEventSound.cs` / the voice phrase. Host per-type cues are a
  coordinated follow-on once that change archives.
- **Copyright:** no Age of Mythology (Ensemble/Microsoft) assets are copied, vendored, or
  reproduced; the "AoM-spirit" theme is original synthesis evoking the RTS-selection *feel*
  only. This matches the repo's build-less, no-vendored-binaries rule.
- **Back-compat:** the existing `events_sound` on/off key is untouched, so a device that had sound
  on keeps it on; a device with no custom files just hears the built-in per-type cues.
- **Understanding app:** `understanding-app/index.html` is the live audition playground — the
  theme grid plus a "Bring your own sound" section mirroring the shipped upload scheme.
