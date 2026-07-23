## Why

The Device (in-browser) cue already branches on the event `type` — a rising motif for
`turn.start`, a resolving one for `turn.ended` (change `add-event-feed-sounds`). The **Host**
cue (`HostEventSound.cs`) never got that treatment: it was deliberately descoped there
(`add-event-feed-sounds` task 7.1, "follow `name-source-in-host-voice` after it archives").
That change has since archived, so the follow-on is now unblocked.

Today the host makes the **same** sound for every event, and in `voice` mode it literally
speaks *"has finished"* even on a `turn.start` — which is wrong. So the operator's
event-determined sounds simply never reach the host.

Separately, the host controls are confusing to operate: the on/off and beep/voice buttons show
*state* as their label (so a button reading "Host on" / "Voice" reads like a command), and the
single **Test host** button only plays whichever mode is currently selected — there is no way to
audition beep and voice independently to confirm each works.

## What Changes

- **Event-determined host cue.** The host cue is selected by the event `type`, distinguishing
  `turn.start` from `turn.ended` with a generic fallback for any other type — mirroring the
  Device cue:
  - `beep` mode plays a **distinct** host notification sound per type (start vs finish vs other),
    all routed through the default audio device (audible), with a type-appropriate console-beep
    motif as the legacy fallback.
  - `voice` mode speaks a phrase that **reflects the event**: *"agent {label} started"* for
    `turn.start`, *"agent {label} has finished"* for `turn.ended` (the existing
    source-naming from `name-source-in-host-voice` is preserved), and a neutral phrase otherwise.
- **Per-mode test.** The host-sound test accepts an explicit `mode`, so the operator can play
  **beep** and **voice** on demand independently of the live mode. The events-app replaces the
  single "Test host" button with **Test beep** and **Test voice**.
- **Clearer controls.** The host section relabels the enable and mode toggles so they read as the
  setting they are (host cue on/off; live sound = beep vs voice), and its note explains that the
  host now distinguishes start from finish.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `event-feed-collector`: the "Optional audible host-side sound on new events" requirement now
  selects the cue by event `type` (start/finish/other) in both modes, and the one-shot test
  accepts an explicit mode so each mode can be auditioned on demand.

## Impact

- **Backend:** `ClaudeWeb.App/Services/Events/HostEventSound.cs` — `Notify` gains the event
  `type`; `Play`/`PlayNow` pick the beep sound and voice phrase from the type; `PlayNow` accepts
  an explicit mode. `CollectorService.Append` passes `type` to `Notify`.
  `CollectorController` `sound/test` accepts an optional `mode` in the body.
- **Frontend:** `events-app/index.html` — host section: relabel `hsnd`/`hmode`, replace `htest`
  with two test buttons posting `{mode}`.
- **Back-compat:** the persisted enable/mode files and the `GET/POST /api/collector/sound`
  contract are unchanged; a `sound/test` call with no body still plays the current mode.
- **Best-effort preserved:** voice still falls back to beep where SAPI is unavailable, the cue
  stays debounced and off the poll thread, and a host with no audio stays silent.
