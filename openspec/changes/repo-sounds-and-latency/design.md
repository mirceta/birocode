# repo-sounds-and-latency — design

## Context (what recon established)

- Host cues fire in `CollectorService.Append` → `HostEventSound.Notify`, i.e. only when
  the **collector ingests** an event.
- `CollectorPoller` runs `PollActiveSourcesAsync` every 2.5s, and that pass walks the
  sources **sequentially**. A dead remote source blocks the pass for the full 6s
  `HttpClient` timeout before the in-process self source is read. The live harness has
  exactly that: the "monster" source has been `unreachable — timed out` on every pass.
  Result: a self event (e.g. `chat.focus`) is cued ~2.5–8.5s late — the reported 5–10s.
- "Sometimes not at all" has two confirmed mechanisms:
  1. `ChatInput.jsx` damps `chat.focus` to one POST per composer per **10s**
     (`FOCUS_EVENT_COOLDOWN_MS`) — a second click inside the window emits nothing.
  2. `HostEventSound` debounces cues to one per 400ms; a slow pass ingests the backlog
     as one burst, so every event after the first in a batch is swallowed.
- The event envelope always carries `{ repoId, repoName }` in `source` (self events as an
  anonymous object, remote events as a `JsonElement`), but `Notify` today receives only
  the **source label + type** — the repo never reaches the cue layer.

## Decisions

### D1 — Latency: publish-triggered self ingest + parallel remote polls

- `HarnessEventFeed` gains a lightweight `Published` callback (event). `CollectorService`
  subscribes and ingests the self source **immediately** on publish (fire-and-forget on a
  background task, never blocking the publisher). The 2.5s poller keeps running as the
  reconciliation path — publish-trigger is an accelerator, not a replacement.
- Self ingestion is serialized by a dedicated lock (watermark read + append + watermark
  update are one critical section), so poller-driven and publish-driven ingest can never
  double-append the same events.
- `PollActiveSourcesAsync` polls **remote sources concurrently** (`Task.WhenAll`, each
  source's errors caught individually, exactly today's per-source status semantics) and
  ingests self **first, synchronously** — a slow remote can then delay nothing but itself.
- Latency target: self event published → host cue ≤ ~1s (in practice: milliseconds).
  Browser (device) cues stay on the events-app 2.5s poll — unchanged and acceptable.
- `FOCUS_EVENT_COOLDOWN_MS` drops 10s → 3s: still damps focus fidgeting, but a
  deliberate re-click after a few seconds cues again. The 400ms host debounce stays —
  with immediate ingest, events no longer pile into one batch, so it rarely bites.

### D2 — Per-repo HOST cue rules: a repo scope layered over the global slot table

- `HostEventSound` keeps its global slot table exactly as-is (same files, same dir — full
  back-compat) and adds **repo-scoped rules**: `collector-host-cues/repos/<key>/<slot>.wav|.mp3`
  plus the existing `<slot>.name` sidecar and a `.repo` sidecar holding the exact repo
  name (the `<key>` directory name is a filesystem-sanitized form; the sidecar is truth).
- Resolution precedence for an event of type T from repo R:
  1. repo rule (R, T)
  2. repo rule (R, `_default`) — in repo scope `_default` means **any event from this
     repo** without a more specific repo rule (that is the point of the feature:
     "this repo's sound"), unlike the global `_default`, which keeps today's
     unknown-types-only semantics
  3. global rule (T)
  4. global rule (`_default`) — only when T is not a recognized slot (unchanged)
  5. built-in mode cue (beep/voice per type, unchanged)
- `Append` extracts `repoName` from the envelope's `source` (anonymous object via
  reflection for self, `JsonElement` for remote) and passes it to
  `Notify(label, type, repo)`.
- Endpoints gain an optional `?repo=<name>` on the existing routes
  (`GET/POST/DELETE /api/collector/sound/rules[/{slot}]`, `POST …/{slot}/test`).
  No repo param ⇒ the global scope, byte-for-byte today's behavior. The listing returns
  `{ rules, repos: [{ repo, rules }] }` so the panel can show every repo scope at once.

### D3 — Per-repo DEVICE cues in events-app: same precedence, device-local

- IndexedDB store unchanged (`cues`, keyPath `type`); repo-scoped records use the
  composite key `"<repo>NUL<type>"` (NUL never appears in repo names — same trick as
  the dock's `KEY_SEP`). Existing plain-`type` records keep working as the global scope.
- `playCue(type, repo)` resolves: repo file (R,T) → repo file (R,`_default`) → global
  file (T) → synth (T) → global file (`_default`) → synth default. (Repo `_default` =
  any event from R, mirroring the host layer.)
- The "Custom event sounds" section gains a **scope picker**: `Global` plus each repo
  that has rules, plus an "add repo…" input with a datalist of repo names observed in
  the feed/dock. The slot grid below edits whichever scope is selected.
- The "Event → sound rules" (host) section gains the same scope picker, driving the
  `?repo=` endpoints.

### D4 — Explicitly out of scope

- No change to voice phrases (they already name the source label).
- No per-source (machine-level) rules — repo scope only, as asked.
- The dead "monster" source is an operator decision to remove; the code change makes it
  harmless either way.

## Risks

- MCI/native playback is unchanged; only rule *selection* changes — low audio risk.
- Concurrency in the collector is the sensitive part; the self-ingest lock and
  per-source status writes (already under `_lock`) keep the invariants.
