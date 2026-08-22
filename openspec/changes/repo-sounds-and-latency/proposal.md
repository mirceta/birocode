# repo-sounds-and-latency — proposal

## Why

The event-feed sounds shipped in `add-event-feed-sounds` (and the host-cue work
after it) key every cue by **event type only** (`turn.start`, `turn.ended`,
`chat.focus`, `_default`). The Operator can hear *what kind* of thing happened but
not *where*: every repository sounds identical. The user wants to assign sounds
**per repository**, so a glance-free ear tells the repos apart.

Separately, cues arrive far too late — and sometimes never. Clicking into an agent
dock box publishes `chat.focus` immediately (POST `/api/events/chat-focus`), yet
the host sound typically lands 5–10 seconds later, or not at all. Recon strongly
suggests why: host cues fire only when the **collector ingests** an event, and
`CollectorPoller` runs one **sequential** pass over all sources every 2.5s
(`CollectorService.PollActiveSourcesAsync`). Any dead remote source blocks the
pass for its full 6s HTTP timeout before the in-process self source is even read —
and the live log shows exactly that: the registered "monster" source has been
timing out on every pass for weeks. Self events (the ones the Operator most wants
to hear promptly) are hostage to the slowest remote. The "not at all" cases need a
confirmed diagnosis in design (candidates: cue-rule gaps, cue coalescing during a
long pass, MCI playback failures).

## What Changes

- **Per-repository sound cues.** A cue can be resolved by repository × event type,
  with sensible fallbacks (repo-specific cue → type cue → default). Applies to both
  sound layers: the host-side cue (collector) and the Device cues in the in-repo
  consumer app (events-app). Note: the host cue path today receives only source
  label + event type (`HostEventSound.Notify`) — the repo lives inside the event's
  data payload, so the cue plumbing must start carrying it.
- **Prompt cues for self events.** Ingestion (and therefore cueing) of the
  in-process self source must be decoupled from remote-source health: a dead or
  slow remote source must not delay self events. Target: a self event is cued
  within ~1s of being published, independent of remote timeouts.
- **Diagnose and fix the dropped-cue cases** ("sometimes no sound at all") once
  the design pins down the mechanism.

## Capabilities

### New Capabilities

- (none — both problems live squarely in existing capabilities)

### Modified Capabilities

- `event-feed-collector`: host-side cue gains per-repository resolution; polling
  gains an isolation/latency requirement (self source never delayed by remote
  sources; a failing remote degrades only itself — strengthening the existing
  "A failing source is isolated" scenario, which today isolates errors but not
  latency).
- `harness-event-feed`: the consumer app's Device cues (per-event-type synth +
  user-supplied audio) gain per-repository assignment with fallback to the
  existing per-type behavior.

## Impact

- **Backend** (`ClaudeWeb.App/Services/Events/`): `CollectorPoller` /
  `CollectorService.PollActiveSourcesAsync` (poll scheduling — per-source
  independence or self-fast-path), `HostEventSound` + its rules store (repo-aware
  keys), `CollectorController` (rules endpoints carry repo scope).
- **events-app** (in-repo consumer): sound-rules panel grows a repository
  dimension; device-local persistence format extends compatibly (existing
  per-type assignments keep working unchanged).
- **Migration/compat**: existing persisted cue rules (host + device) must load
  unchanged and behave as the fallback layer; remote harness sources stay
  read-only and unaffected.
- **Operator-visible**: the long-dead "monster" source stops muffling everything;
  worth surfacing per-source staleness while we're in there (design call).
