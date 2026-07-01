## 1. Backend — mandatory label

- [x] 1.1 In `CollectorService.AddSourceAsync`, trim the label and throw `ArgumentException("Label is required.")` when blank; set `Label` to the trimmed value
- [x] 1.2 Remove the now-unused `DeriveLabel` helper

## 2. Backend — name the source in the voice cue

- [x] 2.1 Change `HostEventSound.Notify()` to `Notify(string? sourceLabel = null)` and capture the label into the background-thread closure
- [x] 2.2 Add `PhraseFor(label)` → "agent {label} has finished" (generic "an agent has finished" when no label); have `Play`/`TrySpeak` speak it
- [x] 2.3 Point `CollectorService.Append` at `_hostSound.Notify(s.Label)`; keep `PlayNow` (test) on the generic phrase

## 3. Frontend — events-app

- [x] 3.1 Mark the label input required (placeholder "label (required)"); block the add and focus the field when blank
- [x] 3.2 Surface the backend's rejection message when an add is refused

## 4. Verify & document

- [x] 4.1 `openspec validate name-source-in-host-voice --strict` passes
- [ ] 4.2 dotnet build clean; manual check: add a source with a label, in Voice mode hear "agent {label} has finished"; adding with a blank label is rejected
- [x] 4.3 Update the events-app Understanding app "Host cue" tab to reflect the per-source phrase
