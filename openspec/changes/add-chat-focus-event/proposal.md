# Proposal: add-chat-focus-event

## Why

The event feed currently knows only two event types, both emitted by the backend
around an agent turn (`turn.start`, `turn.ended`). The Operator wants the sound
system to react to more of what actually happens in the harness — starting with
the moment the End User clicks into the chat textbox in the agent dock. That
moment ("someone is about to talk to the agent") is currently invisible to the
feed, so no cue can be attached to it.

## What Changes

- **New event type `chat.focus`** (name finalized in design): emitted when the
  End User focuses/clicks the chat composer textbox in an agent dock. Carries
  the dock's repo in `source`, same envelope as existing events.
- **First browser-originated event**: today every publisher is backend code
  (`CliRunnerService` → `HarnessEventFeed.Publish`). The composer lives in the
  React client, so this adds a small authenticated **publish endpoint** the
  client calls on focus, which forwards to `HarnessEventFeed.Publish`. The
  existing feed spec explicitly states the feed "exposes no new actions" — that
  requirement is amended to carve out this narrow, fixed-type write path (the
  client cannot publish arbitrary types).
- **Focus-burst damping**: focusing is a high-frequency UI gesture (unlike turn
  boundaries), so emission is debounced client-side so tabbing in and out does
  not spam the feed; exact policy in design.
- **Distinct sound cue for the new type**: add a `chat.focus` slot to the
  events-app sound registry (`SOUNDS` / `CUE_SLOTS`, with custom-upload support
  as for existing types) and to the host-side cue slots
  (`HostEventSound` slots / phrase / beep), so the Operator can assign or hear a
  per-type sound rather than only the `_default` fallback.

## Capabilities

### New Capabilities

_None — this extends existing capabilities._

### Modified Capabilities

- `harness-event-feed`: adds a new event-type requirement ("chat composer
  focused event", alongside the existing turn-started/turn-ended requirements),
  and amends "Feed reads are authenticated and expose no new actions" to permit
  the single scoped publish endpoint for client-originated events. The in-repo
  consumer app requirement gains the new type in its per-type cue set.
- `event-feed-collector`: the "Optional audible host-side sound on new events"
  requirement gains `chat.focus` as a recognized per-type slot (voice phrase,
  beep pattern, custom-file rule).

## Impact

- **Backend (`ClaudeWeb.App`)**: new/extended controller action (likely on
  `HarnessEventsController`) calling `HarnessEventFeed.Publish`;
  `HostEventSound` slot/phrase/beep additions. No storage or envelope changes.
- **Client (`client/`)**: `ChatInput.jsx` gains a focus handler (dock-embedded
  composer; design decides whether the main Chat page composer also counts) and
  a debounced `apiPost` call.
- **events-app**: `SOUNDS` + `CUE_SLOTS` entries for the new type; no engine
  changes (unknown-type fallthrough already works, this adds the distinct cue).
- **Specs**: delta specs for `harness-event-feed` and `event-feed-collector`.
- **Risk**: low — feed is best-effort and append-only; a misbehaving publisher
  is trimmed by the existing soft cap. The new endpoint is session-authed like
  every other API route.
