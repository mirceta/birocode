# repo-sounds-and-latency — tasks

## 1. Latency (backend + client)

- [x] 1.1 `HarnessEventFeed`: add a `Published` notification hook (never throws into the publisher)
- [x] 1.2 `CollectorService`: extract a serialized `IngestSelf()` (dedicated lock around watermark read → append → watermark write); subscribe it to the feed's publish hook (fire-and-forget)
- [x] 1.3 `PollActiveSourcesAsync`: self first + remote sources polled concurrently with per-source error isolation
- [x] 1.4 `ChatInput.jsx`: `FOCUS_EVENT_COOLDOWN_MS` 10s → 3s

## 2. Per-repo host cues (backend)

- [x] 2.1 `HostEventSound`: repo-scoped rule store under `collector-host-cues/repos/<key>/` (sanitized dir + `.repo` sidecar), loaded at startup
- [x] 2.2 `HostEventSound`: resolution precedence repo(type) → repo(_default, any type) → global(type) → global(_default, unknown types) → built-in; `Notify`/`Play` carry the repo
- [x] 2.3 `CollectorService.Append`: extract `repoName` from the envelope source (anonymous object and `JsonElement`) and pass it to `Notify`
- [x] 2.4 `CollectorController`: optional `?repo=` on rules GET/POST/DELETE/test; listing returns global + repo scopes; no-param behavior byte-compatible

## 3. Per-repo device cues (events-app)

- [x] 3.1 IndexedDB composite keys (`repo`, NUL, `type`) beside the existing plain-type global records
- [x] 3.2 `playCue(type, repo)` resolution mirroring the host precedence; feed poll passes the event's repo
- [x] 3.3 Scope picker (Global + repos with rules + add-by-name with observed-repo datalist) driving both the device grid and the host-rules grid (`?repo=`)

## 4. Verify

- [x] 4.1 C# tests: cue resolution precedence (repo/global/default/built-in) and repo-name extraction — 9 tests, all green (suite: 104/104)
- [x] 4.2 Isolated build (self-dev rules) + smoke: with a dead remote source registered (timing out), `chat.focus` reached `/api/collector/events` in ≈0.7s; repo-scoped rule endpoints exercised end to end (upload/list/test/clear, global untouched)
- [x] 4.3 `openspec validate repo-sounds-and-latency --strict` passes
