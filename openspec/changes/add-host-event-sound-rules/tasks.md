## 1. Backend — rule store and playback

- [x] 1.1 `HostEventSound`: add the rules table — allowlisted slots (`turn.start`, `turn.ended`, `_default`), files persisted under `DataDir/collector-host-cues/<slot>.<ext>` with a `<slot>.name` sidecar; load on construction, mutate under a lock
- [x] 1.2 `HostEventSound`: custom-file playback via `winmm` MCI (`mciSendString` open/play-wait/close, unique alias, false on any error), and precedence in `Play`: `custom[type]` → built-in for type; unknown type → `custom[_default]` → built-in generic; unplayable file falls back to the built-in cue
- [x] 1.3 `HostEventSound`: rule management API for the controller — list (slot, hasCustom, fileName), assign (bytes + original name, extension and 2 MB cap enforced), clear, and `PlayEffectiveNow(slot)` for the per-slot test

## 2. Backend — collector endpoints

- [x] 2.1 `CollectorController`: `GET api/collector/sound/rules`, `POST api/collector/sound/rules/{slot}?name=` (raw body, bounded read), `DELETE api/collector/sound/rules/{slot}`, `POST api/collector/sound/rules/{slot}/test`; 400 on unknown slot / bad extension / oversize, with explanatory errors

## 3. Frontend — events-app Sounds tab

- [x] 3.1 Replace the "Event → sound rules — coming soon" placeholder with the real panel: one row per slot showing the effective host sound (custom file name or "built-in cue"), with Upload/Replace, ▸ Test on host, and Clear wired to the rules API
- [x] 3.2 Upload flow: reuse the existing file-picker pattern, send raw bytes with the original filename, surface rejection errors; refresh rows from the list response after every mutation

## 4. Verify

- [x] 4.1 Isolated build (`dotnet build` to a non-live dir per self-dev doc); run existing tests
- [x] 4.2 Endpoint smoke test on an isolated instance: list → upload wav → list shows it → per-slot test returns ok → event ingest plays custom (log/audible) → clear restores built-in; verify invalid slot/extension/oversize are 400s
- [x] 4.3 `openspec validate add-host-event-sound-rules --strict` passes; update the understanding app if the explanation changes
