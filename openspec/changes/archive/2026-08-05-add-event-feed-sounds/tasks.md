## 1. Motif engine (events-app)

- [x] 1.1 Generalize `blip(i)` into a `note(n, t0)` primitive taking `{freq, type, dur, gain, at, to}` (glide via `to`), reusing the existing gain attack/decay envelope
- [x] 1.2 Add `playMotif(notes)` that stagger-plays a list of notes; keep the enable-confirmation `blip()` as a thin wrapper over it
- [x] 1.3 Keep the existing `soundOn` gate, `unlockAudio()`, enable-confirmation blip, and one-shot `pointerdown` re-unlock intact

## 2. Built-in per-type cues + dispatch

- [x] 2.1 Define a `SOUNDS` registry: `eventType -> notes[]`, with a `_default` fallback motif
- [x] 2.2 Author the cues: `turn.start` rising/bright, `turn.ended` warm/resolving (AoM-spirit flavour), `_default` = neutral blip
- [x] 2.3 On each new event, `playForNew(evs)` calls `playCue(evt.type)` per event (capped), never silence for unknown types
- [x] 2.4 `playCue` dispatch order: user file for type › built-in synth for type › user default file › neutral blip

## 3. User-supplied audio (device-local, IndexedDB)

- [x] 3.1 IndexedDB store (`eventsapp-sounds`/`cues`, keyed by `type`) holding `{type, name, bytes}`; tiny `idb()`/`idbReq()` helpers
- [x] 3.2 `playBuffer(type)`: decode stored bytes to an `AudioBuffer` on first play (cached), route through `audioCtx`, honouring the Device toggle
- [x] 3.3 `🎵 Sounds` modal: per-slot Choose/Replace, Test (auditions regardless of toggle), Clear; slots = `turn.start`, `turn.ended`, `_default`
- [x] 3.4 Assign validates decodability (`decodeAudioData`) and rejects undecodable files; Clear reverts the slot to the synth cue
- [x] 3.5 Files stay device-local: nothing uploaded, nothing committed — app remains build-less, relative URLs only

## 4. Descoped (personal-use resolution of design open questions)

- [x] 4.1 **Multi-theme picker + `events_sound_theme` persistence** dropped: for a single personal user, one built-in cue set plus per-type custom uploads covers the need. The AoM-spirit flavour is baked into the built-in cues; the *real* AoM sounds are handled by dropping the files in via §3, not by a theme selector. Revisit only if multiple named themes are actually wanted.

## 5. Playground (understanding-app)

- [x] 5.1 Keep the theme-audition grid; add a "Bring your own sound" section mirroring the events-app scheme (per-type upload → IndexedDB → test/clear)
- [x] 5.2 Reframe the intro card for personal use (built-in homage *or* bring-your-own real audio)

## 6. Verify

- [x] 6.1 Drive `turn.start` then `turn.ended`; the two built-in cues are audibly distinct by design (rising vs resolving)
- [x] 6.2 Unknown `type` plays the `_default` cue (not silence) — exercised via `playCue('some.unknown.type')` in the headless test
- [x] 6.3 Assign → persists across reload → clear reverts; verified headlessly (Playwright: IndexedDB record present after reload, reverts on clear)
- [x] 6.4 No audio files added; app still build-less/self-contained with relative URLs only
- [x] 6.5 `openspec validate add-event-feed-sounds --strict` passes

## 7. Out of scope (tracked, not done here)

- [x] 7.1 Host-side per-type cue — done as its own change **`add-host-event-determined-cue`** (after `name-source-in-host-voice` archived): event-determined beep + voice on the host, plus per-mode test buttons
