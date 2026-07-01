## 1. Backend — HostEventSound mode

- [x] 1.1 Add a `SoundMode` (beep | voice) with a `_mode` field, persisted to a sibling file `collector-host-sound-mode` (default `beep`; missing file ⇒ beep for back-compat)
- [x] 1.2 Add `Mode` getter and `SetMode(string)` that validates to the known set and persists, mirroring the existing `SetEnabled` persistence + logging
- [x] 1.3 Replace `DoBeep()` with a `Play()` that switches on `_mode`; keep the beep path (SystemSounds.Asterisk → Console.Beep) as `beep` and as the fallback
- [x] 1.4 Implement the `voice` path: speak "an agent has finished" via `SAPI.SpVoice` COM (`Type.GetTypeFromProgID`, `dynamic`), robotic rate/pitch, try/catch → fall through to beep
- [x] 1.5 Point `Notify()` (debounced) and `PlayNow()` (test) at `Play()` so the test reflects the live mode

## 2. Backend — API surface

- [x] 2.1 `GET /api/collector/sound` returns `{ on, mode }`
- [x] 2.2 `POST /api/collector/sound` accepts `{ on?, mode? }`, updates whichever is present, echoes `{ on, mode }`; unknown mode is rejected/ignored
- [x] 2.3 Update the controller XML-doc endpoint summary to mention the mode

## 3. Frontend — events-app

- [x] 3.1 Add a Beep/Voice control next to the Host button, reading initial state from `GET /api/collector/sound`
- [x] 3.2 Wire the control to `POST /api/collector/sound { mode }` and reflect the returned mode
- [x] 3.3 N/A — the events-app is a standalone static SPA served under localview, not governed by the React client's `UiModeContext` FEATURES map (its existing Host/Test buttons have no entry there either), so no capability-map entry is needed

## 4. Verify & document

- [x] 4.1 `openspec validate add-host-voice-mode --strict` passes
- [ ] 4.2 Build (client + dotnet) clean; manual check: toggle Voice, press Test host, hear "an agent has finished"; toggle Beep, press Test, hear the beep; restart harness and confirm mode persists — dotnet builds clean and SAPI verified on host; live end-to-end check pending deploy
- [x] 4.3 Update the events-app Understanding app to show the beep-vs-voice cue path (added a "Host cue" tab with a live beep/voice demo)
