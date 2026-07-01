## Why

The spoken host cue says the same thing for every source — "an agent has finished" — so an
operator watching several harnesses can't tell *which* one finished without looking. Naming
the source in the phrase makes the cue actionable, but that only works if every source has a
human-meaningful label, which today is optional.

## What Changes

- Make a source's **label mandatory** when registering a source: a blank/whitespace label is
  rejected (today it silently derives one from the address). The built-in self source keeps
  its machine-name label.
- The **voice cue names the finishing source**: in `voice` mode the host speaks
  *"agent {source label} has finished"* using the label of the source the event arrived
  through, instead of the fixed generic phrase. `beep` mode is unchanged.
- The events-app "Add harness" form marks the label **required** and surfaces the backend's
  rejection if it is left blank.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `event-feed-collector`: the "Register and pull remote harnesses read-only" requirement makes
  the label mandatory rather than optional; the "Optional audible host-side sound on new
  events" requirement has the voice cue speak the finishing source's label.

## Impact

- Backend: `Services/Events/CollectorService.cs` (reject blank label on add; pass the source
  label into the cue), `Services/Events/HostEventSound.cs` (build the per-source phrase),
  `Controllers/CollectorController.cs` (label now required in the add contract).
- Frontend: `events-app/index.html` (label input required + error surfacing).
- Persistence/back-compat: existing persisted sources already carry a label (self = machine
  name, remotes = previously derived), so no migration is needed; the change only tightens
  new adds.
- Behavior note: the cue still fires on each ingested event (as the beep does); the phrase
  reads "has finished" for the source of the triggering event.
