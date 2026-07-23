## 1. Backend — event-determined host cue

- [x] 1.1 `Notify(string? sourceLabel, string? eventType)` — thread the type through from `CollectorService.Append`
- [x] 1.2 Beep: pick a distinct `SystemSounds` per type (`turn.start`/`turn.ended`/other), with a type-shaped `Console.Beep` motif as the fallback only
- [x] 1.3 Voice: `PhraseFor(label, type)` — "started" for `turn.start`, "has finished" for `turn.ended` (unchanged), neutral otherwise; preserve the source-label naming
- [x] 1.4 Keep debounce, background-thread play, best-effort voice→beep fallback, and silent-host behaviour intact

## 2. Backend — per-mode test

- [x] 2.1 `PlayNow(string? mode)` plays in the given valid mode, else the persisted mode; uses the `turn.ended` cue as the representative
- [x] 2.2 `POST /api/collector/sound/test` reads optional `{ mode }`; empty body still plays the current mode (back-compatible)

## 3. Frontend — clearer host controls (events-app)

- [x] 3.1 Relabel `hsnd` → "Host cue: On/Off" and `hmode` → "Live sound: Beep/Voice"; refresh the section note to say the host now distinguishes start vs finish
- [x] 3.2 Replace the single Test host button with **Test beep** and **Test voice**, each POSTing `{ mode }`
- [x] 3.3 App stays build-less/self-contained, relative URLs only (no new assets)

## 4. Verify

- [x] 4.1 `dotnet build` clean
- [x] 4.2 `POST /api/collector/sound/test {mode:"beep"}` and `{mode:"voice"}` each return ok and play on the host
- [~] 4.3 Start-vs-finish distinction verified by code review + the test endpoints (which run the same `Play`/`PhraseFor`/`DoBeep` path); a real live `turn.start`→`turn.ended` through `Notify` not yet driven at runtime
- [x] 4.4 Empty-body `sound/test` still plays the current mode (back-compat)
- [x] 4.5 `openspec validate add-host-event-determined-cue --strict` passes
