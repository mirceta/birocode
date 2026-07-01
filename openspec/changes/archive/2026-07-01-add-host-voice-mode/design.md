## Context

`HostEventSound` (Services/Events/HostEventSound.cs) plays a beep on the host on each new
collector event. It has an `_enabled` bool persisted to a single file
(`AppPaths.DataDir/collector-host-sound` = `"1"`/`"0"`), a debounce, a background-thread
`DoBeep()` (SystemSounds.Asterisk → Console.Beep fallback), and a `PlayNow()` used by the
test endpoint. `CollectorController` exposes `GET/POST /api/collector/sound` (on/off) and
`POST /api/collector/sound/test`. The events-app has a Host on/off button and a Test button.
This change adds a second dimension — *how* it sounds — without disturbing that flow.

## Goals / Non-Goals

**Goals:**
- Add a persisted `mode` ∈ {`beep`, `voice`}; default `beep` (preserves today's behavior).
- `voice` speaks "an agent has finished" via Windows SAPI in a soft female voice, no new NuGet dep.
- Enable toggle, debounce, background play, best-effort swallow, and test all honor the mode.
- Expose mode on the existing sound endpoints; add a Beep/Voice control in the events-app.

**Non-Goals:**
- Custom/configurable phrases or voice selection (fixed phrase this change).
- Per-event-type routing (still fires on every ingested event, like the beep).
- Cross-platform TTS (voice is Windows-only; non-Windows/no-SAPI falls back to beep).

## Decisions

- **Mode persistence:** keep the existing on/off file; add a sibling file
  `collector-host-sound-mode` holding `"beep"`/`"voice"`. Two tiny files keeps back-compat
  (an existing install with only the on/off file reads as mode=`beep`). No format migration.
- **TTS via SAPI COM, not System.Speech NuGet:** create the `SAPI.SpVoice` COM object with
  `Type.GetTypeFromProgID("SAPI.SpVoice")` + `dynamic` and call `Speak(phrase, 0)`
  synchronously on the background thread. This adds **no package** and matches the file's
  "pure-BCL, best-effort" ethos. Wrap in try/catch; on any failure fall through to the beep.
- **Soothing timbre:** prefer a female voice via `GetVoices("Gender=Female")` (e.g. Zira) and
  slow the rate slightly (`voice.Rate = -1`) with natural intonation (no pitch shift), so the
  cue is soft rather than harsh.
- **Play dispatch:** rename the private `DoBeep()` to a `Play()` that switches on the current
  mode. `Notify()` (debounced) and `PlayNow()` (test) both call `Play()`, so the test always
  reflects the live mode — no separate test path per mode.
- **API shape:** `GET /api/collector/sound` returns `{ on, mode }`; `POST` accepts
  `{ on?, mode? }` and updates whichever is present, echoing `{ on, mode }`. `mode` is
  validated to the known set; an unknown value is rejected/ignored (stays on current mode).
- **UI:** a Beep/Voice toggle next to the Host button, wired to `POST .../sound { mode }`,
  reading initial state from `GET .../sound`. Registered `'advanced'` in `UiModeContext.jsx`.

## Risks / Trade-offs

- **SAPI availability/latency:** first `Speak` can cost a few hundred ms; it runs on the
  background thread and is debounced, so it never blocks the poll loop. Missing voice →
  caught → beep fallback, consistent with the existing swallow-all posture.
- **Two-file state:** marginally more persistence surface than one file, but avoids a
  format migration and keeps each file trivially readable. Acceptable.
- **COM on a server thread:** `SpVoice` is STA-friendly but works from a thread-pool thread
  for fire-and-forget `Speak`; we do not hold the instance — create, speak, release per cue.
