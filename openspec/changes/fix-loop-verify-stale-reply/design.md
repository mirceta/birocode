# fix-loop-verify-stale-reply — design

## D1 — Freshness is temporal, not textual

The engine's staleness question is "has the agent answered my last send?", and
the only robust currency for it is time: `LoopState.LastSentAt` (stamped by
`RecordSend`, reset to 0 on every arm) vs the trailing assistant message's
transcript timestamp — the same same-box comparison the pre-arm gate
(fix-loop-arm-freshness) already trusts against `ArmedAt`. A reply is fresh iff
`timestamp > LastSentAt`.

Snippet equality (`_lastDriveSent`) is dropped as the control signal because it
answers a different question ("is the text unchanged?") and fails both ways:
identical re-replies read as stale, and *any* trailing text that differs from
the sent-against snippet reads as a fresh reply — which is exactly how the
synthetic repair line, or a reply to some other writer, could be judged as a
verification verdict. The snippet survives only in `SendPrompt` and
`DebugSnapshot` as human-readable evidence of what the send was decided
against.

Double-send protection needs no separate guard anymore: deciding on a fresh
reply always ends in a send (driven kinds return only Propose/Stop), and that
send's new `LastSentAt` makes the just-judged reply stale for every later tick.

## D2 — The witnessed reply: run buffer over transcript

`CliRunnerService` translates the CLI's `text_delta`s into `token` events that
already flow through `RunSession.EmitAsync` into the seq buffer. The run
session now also accumulates them into `ReplyText` and stamps `ReplyTextAtUtc`
at the last delta — the harness's first-hand record of what the agent said,
independent of whether the CLI persists it.

Preference order per tick (drive mode, driven kinds, `LastSentAt > 0`):

1. transcript reply newer than `LastSentAt` → use it (the durable source stays
   authoritative when it works);
2. else, completed builder run whose `ReplyTextAtUtc > LastSentAt` and whose
   `ReplyText` is non-blank → use the witnessed text (logged);
3. else → the reply is missing (D3).

The witnessed text is the concatenation of every visible text block of the
turn, which can be a superset of the transcript's final assistant message.
That is safe for every judgment the kinds make: sentinel/`STEP_VERIFIED`/
`GOAL_VERIFIED` checks anchor on the final non-empty line (identical in both
representations), and `NEEDS_HUMAN:`/deny-list are whole-reply scans whose
false-positive direction is "stop and ask the human".

A harness restart drops run sessions, so a reply that was lost *and* never
witnessed resolves through the no-reply ladder as `error · no-reply` — honest,
and strictly better than judging stale text.

## D3 — Kinds never judge a missing reply

`LoopContext.LastAssistant == null` now uniformly means "the agent has not
answered yet" (pre-arm, or no fresh reply after a send). On the no-reply
retry ticks the engine passes null instead of the stale trailing text. Kinds
respond by re-proposing the prompt their phase is waiting on:

- queue `verify` → re-send the composed verification prompt (stay `verify`);
- goal `verify` → re-send the stored verification prompt (stay `verify`);
- work phases already propose their work/head prompt on null (pre-arm path).

The ladder semantics of fix-loop-noreply-stall are preserved verbatim: one
grace tick, each retry is a real send bumping the iteration counter (cap
bounds it), `MaxNoReplyRetries` consecutive misses resolve `error · no-reply`,
and a fresh reply or re-arm clears the counters. An errored run still stops the
loop via the `RunErrored` ladder rung on the retry decide.

## D4 — Synthetic repair lines are not replies

The CLI's resume repair writes an assistant line with `message.model` equal to
`"<synthetic>"` (observed text: "No response requested.") and a *current*
timestamp — so it can defeat the temporal gate if a repair happens after a
send. The transcript parser marks such messages, and the loop's pinned read
skips them when picking the trailing assistant message. Chat UI rendering is
deliberately untouched.

## D5 — Deterministic verification: a stub CLI that streams but never persists

The e2e extends the fix-loop-noreply-stall stub trick: a tiny .NET console
published as `claude.exe`, prepended to the harness PATH, that speaks real
`stream-json` (init → text deltas → result), echoes back the resumed session
id (so the pin never moves), and — per a mode file — persists nothing, appends
a synthetic repair line, or stays silent. This reproduces the exact live
incident (streamed reply, no transcript write) deterministically, with no
tokens spent, covering: drain-on-witnessed, honest no-reply, real
failed-verification escalate, and synthetic-line immunity.
