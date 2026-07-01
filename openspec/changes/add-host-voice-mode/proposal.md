## Why

The host-side event sound today is a single fixed beep, which is easy to miss and says
nothing about what happened. An operator watching a fleet wants an unambiguous, spoken
cue — "an agent has finished" — instead of a generic tone, without opening a browser.

## What Changes

- Add an operator-toggled, persisted **mode** to the existing host-side event sound with
  two values: `beep` (the current default) and `voice`.
- In `voice` mode the host speaks a short robotic text-to-speech phrase —
  *"an agent has finished"* — through the default audio device, using Windows SAPI
  (`SpVoice` via COM, no new NuGet dependency), tuned to sound robotic (adjusted
  rate/pitch). `beep` mode is unchanged.
- The existing on/off enable toggle, debounce, background-thread play, best-effort failure
  swallowing, persistence-across-restart, and one-shot test all continue to apply and now
  honor the selected mode — the test plays whatever the current mode is.
- Expose the mode on the collector sound endpoints (read it back and set it) alongside the
  existing on/off state.
- Add a UI control in the events-app to pick Beep vs Voice (Advanced mode by default).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `event-feed-collector`: the "Optional audible host-side sound on new events" requirement
  gains a selectable sound mode (beep vs spoken voice) that the enabled sound and the
  on-demand test both honor, persisted across restarts.

## Impact

- Backend: `Services/Events/HostEventSound.cs` (mode field, persistence, TTS play path),
  `Controllers/CollectorController.cs` (`GET`/`POST /api/collector/sound` carry the mode).
- Frontend: `events-app/index.html` (Beep/Voice control), `client/.../UiModeContext.jsx`
  capability map entry (Advanced).
- Dependencies: none added — TTS uses the OS SAPI COM component already present on Windows.
- Platform: voice path is Windows-only; on any host where SAPI is unavailable it falls back
  to the existing beep, so sound remains best-effort.
