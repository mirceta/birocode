## Context

Two sound layers exist today, both type-blind:

| Layer | File | Today | Scope |
|-------|------|-------|-------|
| Device | `events-app/index.html`, `blip()` | one triangle blip on every event | per-browser toggle (`events_sound`) |
| Host | `Services/Events/HostEventSound.cs` | beep, or SAPI voice phrase | shared operator toggle |

The events-app already has the whole audio-unlock dance (browsers block audio until a user
gesture; the sound toggle *is* the unlocking gesture, and a `pointerdown` re-unlock is wired for
returning visitors). `blip(i)` is already a parametrized oscillator: `type`, `frequency`, a gain
attack/decay envelope, staggered start time. So "different sounds per event" is a small
generalization of code that already exists, not new infrastructure.

The harness-event-feed spec's "In-repo consumer app observes the collector" requirement already
mandates the app render **generically from the envelope** so unknown `type`s don't break it. The
sound behaviour must uphold the same contract: an unknown `type` must still make *a* sound.

## Goals / Non-goals

**Goals**
- Distinct Device cue per event `type`; `turn.start` ≠ `turn.ended` by ear.
- A selectable, per-device-persisted **theme**, one being an original AoM-spirit homage.
- Generic fallback cue for unknown `type`s (forward-compatible with new event types).
- Zero new assets, zero backend change, keep the existing toggle + gesture-unlock semantics.

**Non-goals**
- The **Host** layer. It is mid-flight in `name-source-in-host-voice`; touching
  `HostEventSound.cs` now would conflict. Host per-type cues are a follow-on.
- Vendoring or reproducing Age of Mythology audio. Homage = original synthesis only.
- A shared/server-side theme. Theme is a per-device preference, like the on/off toggle.

## Decisions

### 1. Motif engine: `playMotif(notes)` over a `SOUNDS[type]` registry
Generalize `blip(i)` into `note(n, t0)` playing one `{freq, type, dur, gain, at, to}` note
(`at` = stagger offset, `to` = optional glide target), and `playMotif(notes)` playing a list.
A theme is `type -> notes[]`. On a new event the app calls
`playMotif(theme[evt.type] ?? theme._default)`. This is the exact primitive prototyped in
`understanding-app/index.html`, so the audition and the shipped code share one design.

### 2. Semantic mapping so events are ear-distinguishable
- `turn.start` → **rising / bright** (something began)
- `turn.ended` → **settling / warm resolve** (something finished)
- unknown `type` → the theme's `_default` (today's neutral blip), never silence.

### 3. AoM-spirit homage — legal path
An original theme evoking the *snappy, playful "unit answers your click"* feel with short
square/triangle motifs. **No** game audio is copied or vendored; nothing is a transcription of a
specific in-game line. This keeps the app build-less and avoids reproducing copyrighted assets.

### 4. User-supplied audio wins over synthesis (device-local)
The headline of the shipped change: the user can assign their **own** audio file per event `type`.
This is the honest answer to "I want the AoM sounds" for a personal at-home harness — the user
drops the real files in, at their own responsibility, and the repo still vendors nothing.

- **Storage:** raw file bytes in **IndexedDB** (`eventsapp-sounds`/`cues`, keyed by `type`), never
  a server, never git. Chosen over a repo `sounds/` folder (would commit binaries, break
  build-less, and can't be filled from a phone) and over a backend upload endpoint (unneeded
  backend for a single user). Device-local matches every other events-app preference.
- **Playback:** decode stored bytes → `AudioBuffer` on first play (cached in `customBuf`), play via
  an `AudioBufferSourceNode` on the **same** `audioCtx`, so the Device toggle + gesture-unlock gate
  it exactly like the synth path. `.slice(0)` the bytes before `decodeAudioData` (it detaches the
  buffer) so the stored copy survives re-decode.
- **Dispatch — `playCue(type)`:** custom file for `type` › built-in synth `SOUNDS[type]` › custom
  `_default` file › neutral blip. So a custom file overrides synthesis per type, and clearing a
  file cleanly reverts that type to its synth cue.
- **UI:** a `🎵 Sounds` modal with slots for `turn.start`, `turn.ended`, and `_default` (other
  events), each Choose/Replace · Test · Clear. **Test** auditions regardless of the on/off toggle
  (like the host Test). Assign runs `decodeAudioData` first and **rejects undecodable files**
  rather than storing a silent dud.

### 5. Toggle & unlock unchanged
Reuse the existing `soundOn` gate, `unlockAudio()`, the confirmation blip on enable, and the
one-shot `pointerdown` re-unlock. Sound-off stays fully silent — synth and custom alike.

### 6. Built-in cue set, not a multi-theme picker (personal-use scope)
The original plan had a `THEMES` registry with a `localStorage` theme selector
(`events_sound_theme`). **Descoped.** This harness is single-user and at-home, so we ship **one**
built-in per-type cue set (AoM-spirit flavour: `turn.start` rising, `turn.ended` resolving,
`_default` blip) and let the user reach for **custom uploads** when they want something specific —
which is strictly more powerful than a fixed palette of synth themes. The multi-theme picker can
return later if named themes are ever actually wanted; the `SOUNDS` registry is already shaped for
it (`themeName` would just wrap the current map).

## Risks / Trade-offs
- **Auditory spam:** a burst of events could stack motifs. Mitigation: keep motifs short
  (<~0.3s) and cap concurrent voices as `blip()`'s burst code already staggers; reuse that cap.
- **Taste is subjective:** hence the audition playground and a selectable theme rather than one
  baked-in sound.
- **Host/Device drift:** until the Host follow-on lands, Host stays a single cue while Device is
  per-type. Acceptable — they are independent layers with independent toggles.

## Open Questions (resolved)
1. **Default cue** — ~~plain blip or AoM-spirit homage?~~ **Resolved:** built-in per-type cues use
   the AoM-spirit flavour (honours the ask); `_default` stays the neutral blip.
2. **Theme picker UI** — ~~ship a selector now or later?~~ **Resolved: no picker.** Custom uploads
   (decision 4) supersede a synth-theme selector for a single personal user. See decision 6.
3. **Which candidate themes** to include — ~~moot with the picker gone.~~ The other audition themes
   (Two-tone, Marimba, Glass, Chime) live on only in the `understanding-app` playground for taste;
   the shipped app carries the one built-in set plus whatever the user uploads.
