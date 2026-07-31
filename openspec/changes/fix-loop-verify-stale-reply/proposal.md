# fix-loop-verify-stale-reply

## Why

The first live queue-loop verification (2026-07-31, session 194f3269) escalated
`step-unverified: "No"` twenty seconds after the verification prompt was sent —
while the agent's actual verification reply (ending `STEP_VERIFIED`) was
streaming into the chat UI. Two failures stacked:

1. **CLI anomaly (out of our control):** claude CLI 2.1.220 completed the run,
   billed it, streamed the reply — and never wrote the assistant message into
   the session transcript. The next `--resume` repaired the dangling user turn
   with a synthetic assistant line (`model: "<synthetic>"`, text
   `"No response requested."`). Seen twice that day in one session.
2. **Engine bug (ours):** the drive no-reply escape (fix-loop-noreply-stall)
   noticed the trailing message hadn't moved, cleared the dedup guard, and let
   the kind decide again **on the unchanged trailing text** — the previous
   step's reply. A queue loop in its verify phase judged that stale text as the
   verification verdict and escalated. By construction the retry path could
   never produce anything else: the text it re-judges is *guaranteed* to be the
   pre-send reply.

The root defect: the engine equates "the trailing assistant message" with "the
reply to my last send" using only snippet equality. Loop kinds that *judge* a
reply (queue/goal verify phases) must never be handed text that predates the
prompt they are judging the answer to.

## What Changes

- **Temporal reply freshness (engine):** for a drive-mode driven loop that has
  sent at least once, the pinned transcript's trailing assistant message counts
  as the reply only if its timestamp is newer than the loop's `LastSentAt`.
  Snippet equality no longer decides staleness (the `_lastDriveSent` snippet is
  kept only as debug evidence).
- **Witnessed reply (engine + chat):** the run session already buffers every
  streamed `token` event of the turn. The run session now retains the turn's
  concatenated reply text and its emit time; when the transcript holds no reply
  newer than the last send but the completed builder run streamed one, the
  engine judges *that* text — the harness witnessed the real reply, so a lost
  transcript write no longer degrades the loop at all.
- **No judgment on missing replies (kinds):** when neither source has a fresh
  reply, the kind decides with `LastAssistant = null`. Queue and goal loops in
  their verify phase then re-send the verification prompt (staying in verify)
  instead of judging absent text. The existing no-reply ladder is unchanged:
  grace tick, bounded retries, then an honest `error · no-reply` stop.
- **Synthetic placeholder filter (engine read):** assistant messages stamped
  `model: "<synthetic>"` (the CLI's resume repair, e.g. "No response
  requested.") are not agent replies; the loop's transcript read skips them so
  a repair line can never be judged as a verification verdict.

Out of scope: suggest-mode freshness (no engine send to anchor a timestamp to;
its failure direction is a hold with the human already in the loop) and the
chat UI's rendering of synthetic lines.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `autopilot-loops` — reply freshness, witnessed replies, verify-phase retry,
  synthetic filter (additive requirements).
- `chat` — run sessions retain the turn's streamed reply text for engine
  consumers (additive requirement).
