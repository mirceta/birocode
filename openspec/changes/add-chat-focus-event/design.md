# Design: add-chat-focus-event

## Context

The harness event feed (`HarnessEventFeed`, in-memory, append-only, soft-capped)
has exactly two publishers today, both backend: `CliRunnerService` publishes
`turn.start` / `turn.ended` around an agent turn. The feed is read via
`GET /api/events` (producer) and `GET /api/collector/events` (aggregate), and two
sound layers react per event `type`: the events-app browser engine
(`SOUNDS` registry + `CUE_SLOTS` custom uploads in `events-app/index.html`) and
the host cue (`HostEventSound` slots / voice phrases / beep patterns + the
event→sound rules table). Both layers already fall back to a generic cue for
unknown types, so a new type makes *a* sound with zero code — this change is
about making it a *distinct, assignable* one.

The moment to capture — the End User clicking into the chat composer of an agent
dock — happens purely in the React client (`ChatInput.jsx`, the `<textarea>` used
both by the main Chat page and, with `embedded`, by each dock). Nothing
client-side can publish to the feed today; the spec explicitly says the feed
"exposes no new actions".

Adjacent in-flight work: `add-event-feed-sounds` (browser per-type cues) and
`add-host-event-sound-rules` (host per-type slots + rules table) are complete
but **not yet archived**, so their requirements exist only as deltas. This
change's spec deltas therefore avoid MODIFY-ing those texts (see Decisions).

## Goals / Non-Goals

**Goals:**

- Emit a new feed event, **`chat.focus`**, when the End User focuses the chat
  composer textbox in an agent dock, so the sound system (and any feed consumer)
  can react to "someone is about to talk to the agent".
- Give the new type a distinct cue slot in both sound layers (browser synth +
  custom upload; host beep/voice/rules slot).
- Keep the feed's safety story intact: the write path is a single, fixed-type,
  authenticated endpoint — clients still cannot publish arbitrary events.

**Non-Goals:**

- No emission from the main (non-dock) Chat page composer — the ask is the agent
  dock; widening later is a one-line change and a small spec delta.
- No generic client→feed publish API (deliberately rejected, see Decisions).
- No per-type mute switch for the host cue (pre-existing gap, noted in Risks).
- No changes to the feed envelope, retention, or read contracts.

## Decisions

1. **Event type name: `chat.focus`.** Follows the existing `noun.verb`-ish
   taxonomy (`turn.start`, `turn.ended`). Alternative `composer.focus` rejected:
   "chat" is the vocabulary the specs and UI already use.

2. **Trigger = the textarea's `focus` event, not `click`.** Focus covers
   click-to-focus *and* keyboard/tab focus, and fires once per entry rather than
   once per click inside an already-focused box. This matches the user intent
   ("as soon as we click on the chat textbox") without double-firing.

3. **Dock-only emission via the existing `embedded` prop.** `ChatInput` is
   shared between the main Chat page and dock embeds; the handler only emits
   when the composer is dock-embedded, keeping the event's meaning precise
   ("End User engaged a dock"). `data` carries the dock context it has (e.g.
   the dock/stash tab id) so consumers can tell docks apart; `source` carries
   the repo, like every event.

4. **Client-side debounce: at most one event per composer per 10 s.** Focus is
   a high-frequency gesture (tab away / tab back); without damping a fidgety
   user turns the feed and both sound layers into a metronome. A 10 s
   per-composer cooldown (module-level timestamp, no persistence) keeps the
   signal "user showed up at the dock" while staying simple. Server-side
   throttling rejected for now: single trusted client, feed is soft-capped and
   best-effort anyway.

5. **Write path: `POST /api/events/chat-focus` on `HarnessEventsController`,
   fixed type.** The endpoint accepts no `type` field — it publishes exactly
   `chat.focus`, deriving the repo from the existing `X-Repo-Id` header (same
   helper as other API calls) and resolving the repo name server-side, then
   calls `HarnessEventFeed.Publish`. Returns 204; the client fires and forgets
   (an error never disturbs typing). Alternatives rejected:
   - *Generic `POST /api/events`* (client supplies type/data): would let any
     authenticated client fabricate `turn.ended` etc., breaking consumers'
     trust in event provenance and gutting the "feed only reports events"
     requirement rather than amending it narrowly.
   - *Inferring focus server-side*: impossible; the gesture only exists in the
     browser.
   The spec delta MODIFIes "Feed reads are authenticated and expose no new
   actions" to carve out exactly this: one authenticated, fixed-type publish
   endpoint that can cause **no harness action** — publishing to the
   best-effort feed is the entire effect.

6. **Sound layers get explicit `chat.focus` entries.**
   - events-app: a `SOUNDS["chat.focus"]` motif (short, soft, "attention"
     flavour — audibly distinct from `turn.start`'s rising figure) and a
     `CUE_SLOTS` entry so a custom file can be assigned, exactly like the
     turn types.
   - Host: `chat.focus` joins the `HostEventSound` slots array, gets a distinct
     beep pattern and a voice phrase in the existing style (phrase names the
     source, present tense — e.g. "someone is at the chat on <source>"), and
     thereby a row in the event→sound rules table for a custom host file.

7. **Spec deltas use ADDED requirements (plus one MODIFIED against baseline).**
   The per-type cue requirements this feature extends live in the unarchived
   deltas of `add-event-feed-sounds` / `add-host-event-sound-rules`, so they are
   not in the baseline and cannot be MODIFY-ed here without colliding at archive
   time. Instead the distinct-cue obligations for `chat.focus` are stated as
   their own ADDED requirements; the only MODIFIED delta targets the baseline
   requirement "Feed reads are authenticated and expose no new actions", whose
   text is in the baseline today. Archive order between this change and the
   sound changes then does not matter.

## Risks / Trade-offs

- **[Cue fatigue]** Every dock focus now makes a sound wherever sound is on.
  → 10 s debounce; both layers' toggles still silence everything; a custom
  near-silent file can be assigned per type. A true per-type mute is a known,
  pre-existing gap across all types — follow-on if it annoys in practice.
- **[Feed noise]** `chat.focus` events interleave with turn events in the feed.
  → Envelope is typed; consumers already render unknown types generically, and
  the retention cap bounds memory. No consumer filters by type today.
- **[New write surface]** The feed gains its first client-reachable publisher.
  → Fixed type, session-authed, no client-controlled `type`, publish is
  best-effort and side-effect-free; the spec delta pins all of this.
- **[Shared component]** The focus handler lives in `ChatInput`, used by both
  the main page and docks. → Emission is gated on the dock-embedded case; the
  main page path is untouched at runtime.

## Open Questions

- None blocking. (Deferred: should the main Chat page composer also emit —
  revisit once the dock cue has been lived with.)
