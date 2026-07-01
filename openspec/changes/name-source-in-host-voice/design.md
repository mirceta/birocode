## Context

The spoken cue lives in `HostEventSound.TrySpeak()`, which speaks a constant `VoicePhrase`.
`CollectorService.Append(Source s, …)` calls `_hostSound.Notify()` (parameterless) for every
ingested event — it already holds the `Source`, so the label is in hand at the call site.
`AddSourceAsync` currently fills a blank label from `DeriveLabel(addr)`. The self source is
seeded with `Environment.MachineName`. Sources persist to `collector-sources.json` and every
existing entry already has a non-empty label.

## Goals / Non-Goals

**Goals:**
- Reject a blank label on add (`ArgumentException` → the controller's existing 400 path).
- Speak "agent {label} has finished" in `voice` mode, using the triggering event's source label.
- Make the events-app label input required and show the backend rejection.

**Non-Goals:**
- Gating the cue to only "finished"-type events — it still fires per ingested event like the beep.
- Serializing overlapping speech, custom phrase templates, or per-source voices.
- Renaming/backfilling existing sources (they already have labels).

## Decisions

- **Label required at the service boundary:** in `AddSourceAsync`, trim the label and throw
  `ArgumentException("Label is required.")` when empty, instead of `DeriveLabel`. Remove the now
  unused `DeriveLabel`. The controller already maps `ArgumentException` → `BadRequest{error}`,
  so the events-app just needs to surface that message. Keeping the rule in the service (not
  only the controller/UI) means every caller is covered.
- **Thread the label into the cue:** change `Notify()` to `Notify(string? sourceLabel = null)`
  and capture the label in the background-thread closure; `Append` passes `s.Label`. The phrase
  is built by a small helper `PhraseFor(label)` → `"agent {label} has finished"`, falling back
  to the generic "an agent has finished" when no label is supplied.
- **Test button stays generic:** `PlayNow()` has no source, so the Test cue speaks the generic
  phrase (still confirms audio + voice). The per-source naming is exercised by real events.
- **Debounce unchanged:** the existing 400 ms debounce still collapses bursts; the phrase names
  whichever event won the debounce. Acceptable for a notification cue.

## Risks / Trade-offs

- **Odd/long labels spoken verbatim:** SAPI reads whatever the label is (URLs, punctuation). We
  accept this — labels are operator-chosen and now required to be meaningful.
- **"has finished" for any event type:** the cue fires on every ingested event, so the wording
  is slightly generic if a non-terminal event type ever appears. Matches today's beep trigger;
  revisit only if event types diversify.
- **Overlapping speech on sustained bursts:** unchanged from the current voice implementation;
  debounce keeps it rare. Not solving serialization here.
