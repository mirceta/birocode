# queue-loop-prompt-transparency — design

## Context

Every driven loop send (queue item, queue step-verify, goal work/verify, recipe)
is composed at the drive choke point (`AutopilotService`, openspec
loop-agent-briefing D1) as `briefing frame + enabled rules [+ footer clauses] +
contract line + stored text`, and that composition (`sendText`) is what the CLI
receives. But the synthetic `user` event published into the run buffer carries
only the RAW stored text plus `briefed`/`briefingRev` flags
(`AutopilotService.SendPrompt`, `AutopilotService.cs:807`), and the chat bubble
renders that raw text with a "📝 autopilot briefing attached" tag
(`MessageBubble.jsx:36`). That was decision D3 of `loop-agent-briefing`:
raw-plus-flag everywhere, full composition disclosed only at preview surfaces.

Two problems, reported from real use:

1. **The chat feels deceptive.** For the queue kind the stored item is a terse
   one-liner; the wrapper (situational briefing, rules, footer clauses, contract
   line — and for step-verify the whole verify template) dwarfs it. The operator
   reading the chat cannot see what the agent was actually told. The goal loop
   only *feels* honest because its stored text is a full arm-time template.
2. **Live and reloaded chat already disagree.** The transcript endpoint
   (`SessionService.GetMessages`, `SessionService.cs:113`) reads the CLI's own
   JSONL, where the user turn IS the full composition — so after any reload or
   late attach via transcript, the full briefed text is what renders. The live
   raw-plus-tag bubble is the odd one out; D3's "no per-send noise in chat" is
   already only half true.

**Amendment 2 — queue audit.** The operator also asked for "an audit log of
which prompts were sent through the queue loop". The durable ledger exists
(`AutopilotAuditLog`, `%APPDATA%\ClaudeWeb\autopilot-audit.jsonl`, append-only,
one line per auto-send — plans/loop-autopilot-safety.md fence #3), and two
views slice it (dashboard Autopilot panel: per-repo last 10; console state:
recent 50). But it cannot answer the question as asked:

1. Entries carry no loop **kind** — a queue send, a goal send, a recipe send,
   and a suggestion auto-send all record outcome `"loop"`/`"sent"` with no way
   to filter to the queue.
2. Entries hold the RAW stored text; the exact composed prompt is only
   *reconstructable* (frame + rules-at-rev + text), never *readable*.
3. The only queue-specific list is the per-arm `QueueSentTexts` (cap 20,
   structurally reset on every re-arm — openspec queue-loop-visibility D3 said
   "the full trail stays in the audit log", which is true but unreadable).

## Goals / Non-Goals

**Goals:**

- The chat shows, byte for byte, the text every driven loop send handed to the
  CLI — live (synthetic user event) and reloaded (transcript) render the same.
- The durable audit can answer "which prompts did the queue loop send, and
  what exactly did the agent receive?" — per repo, across arms, behind the
  operator gate.
- Remove the "📝 autopilot briefing attached" affordance; nothing in the chat
  claims to summarize a hidden composition anymore.
- Keep the non-chat D3 surfaces exactly as they are: audit log, queue
  sent-history, state snippets, and `RecordQueueStep` keep the RAW stored text
  with the briefed flag + rules revision (truncated operator lists stay
  readable; the verify template keeps quoting the raw item).

**Non-Goals:**

- No change to what is SENT (composition is untouched — this is display only).
- No collapse/expand styling of the wrapper inside the bubble in this change —
  the full text renders plainly, exactly as the transcript reload already does.
  A fold affordance can come later if long bubbles annoy in practice.
- No change to suggest mode (pending prompts are raw by construction) or the
  suggestion kind's routine auto-sends (unbriefed; bubble already equals sent
  text).
- No retro-rewrite of already-buffered events from runs in flight during deploy.

## Decisions

### D1 — Emit the composed text in the synthetic user event

`SendPrompt` publishes `sendText` (the briefed composition, or the raw prompt
when the kind is unbriefed) as the `user` event's `text`, instead of `prompt`.
The `briefed`/`briefingRev` fields drop from the event: their only consumer was
the chat affordance, and the audit entry (which keeps them) remains the durable
record of flag + revision. `actor: "loop"` stays.

Everything else in the engine keeps consuming `propose.Prompt` (raw) unchanged —
consume refs, `RecordQueueStep`, audit, state snippets — the D1 choke-point
separation from loop-agent-briefing is what makes this a one-line send-side
change.

Alternative rejected: emitting both texts (raw + composed) and letting the
client choose — two sources of truth for one bubble; the client has no
legitimate reason left to prefer the raw text once the chat's contract is
"show what was sent".

### D2 — Client renders the event text verbatim; the affordance dies

- `ChatContext.jsx`: `addServerPrompt(key, evt.text)` — the `briefed` parameter
  and the message-level `briefed` field go away.
- `MessageBubble.jsx`: drop the `briefed` prop and the `msg__briefed` span;
  `Chat.jsx:349` stops passing it. The `.msg__briefed` CSS rule is removed.
- i18n: `chat.briefedTag` / `chat.briefedTitle` deleted from `en.json` and
  `tr.json`. The dashboard keys (`dashboard.loopSentBriefed*`) stay — the
  sent-history badge is a kept D3 surface.

Old messages with a stale `briefed: true` field (from a client that kept state
across the deploy) render as plain user bubbles — the field is simply ignored,
no compatibility shim needed.

### D3 — Spec honesty: the disclosure requirement is amended, not dropped

The `autopilot-loops` requirement "Briefed sends stay honestly disclosed
without per-send noise" is MODIFIED: the no-per-send-noise clause now covers
the audit log, sent-history, and state snippets only; the synthetic user event
and chat bubble move to exact-sent-text. The reconstructability promise
(rev-stamped rules + raw text) is unchanged. The "Chat bubble marks the
briefing" scenario is replaced by "Chat shows exactly what was sent". The
class summary in `LoopConfigStore` / comments referencing D3's chat behavior
are updated in the same pass (the honesty-pass rule from loop-agent-briefing:
stale wording is a task, not a hope).

### D4 — Audit entries gain kind, phase, and the exact sent text (additive)

`AutopilotAuditLog.Entry` gains three fields, all additive with defaults so
old `.jsonl` lines deserialize unchanged:

- `Kind` (`""` on old lines) — the loop kind (`queue`/`goal`/`recipe`/
  `suggestion`) stamped at `SendPrompt` from `loop.Kind`.
- `Phase` (`""`) — `work` or `verify`, from the proposal's `EnterPhase`
  bookkeeping, so a queue item and its step-verify send are distinguishable.
- `SentText` (`null`) — the exact composed text, recorded ONLY when it differs
  from `Prompt` (i.e. briefed sends); `null` means "sent exactly as `Prompt`".
  This keeps unbriefed lines byte-identical in cost and makes the semantics
  explicit rather than duplicating the raw text.

The raw `Prompt` stays first-class: every truncated projection (dashboard
slice, console list) keeps rendering it, so D3-of-loop-agent-briefing's
no-noise argument still holds for lists. The revision-based reconstruction
path stays valid for pre-amendment lines.

Alternative rejected: a separate queue-only ledger file — a second
append-only file duplicating what the existing fence-#3 ledger already
witnesses; one durable record with attribution beats two half-records.

### D5 — A gated Queue audit view on the dock loop card

New endpoint `GET /api/autopilot/loops/queue-audit?repoId=` — operator-gated
like `loops/detail` (it is a prompt disclosure: full raw text + full sent
composition). It filters the ledger to this repo's queue-kind entries, newest
first, bounded (e.g. last 200), each row: timestamp, phase, raw text, and the
exact sent text (`SentText ?? Prompt`).

UI: the dock loop card's queue section (where the per-arm sent-history
already renders, `DockLoopControl.jsx`) gains a "Queue audit" affordance that
opens the durable list — rows collapsed to the raw text with a phase badge,
expandable to the full sent text. It states plainly that this list is durable
across arms, unlike the per-arm list above it. Rides the existing loop-controls
capability (the dock loop section is already Advanced-gated); no new
UiModeContext entry.

Alternative rejected: an Autopilot-console-only view — same reasoning as
loop-agent-briefing D5: the dock card is where the operator already inspects
the queue; the console remains the place for the raw cross-repo ledger.

## Risks / Trade-offs

- [Chat gets noisier — every queue item bubble now starts with the same ~120-word
  briefing prefix] → accepted deliberately: the operator asked for verbatim truth
  over tidiness; the transcript reload already looks like this today, so it is
  not new visual territory. A fold affordance is the designated follow-up if it
  grates.
- [Something downstream keyed on the user event's raw text] → checked: the only
  consumers of the `user` event are the chat render paths (`ChatContext.jsx`
  live handler + replay); state snippets and dedup logic read engine-side
  records, not the event.
- [Eval/e2e assertions expect the raw-text bubble or the briefed tag] → task:
  grep the loop-eval scenarios and Playwright checks for `briefedTag`/raw-bubble
  expectations and update them to expect the composed text (none found in
  `LoopEvalRunnerService` at design time; the sweep is still a task).
- [i18n key removal breaks a stale reference] → grep for both keys after removal;
  the client build fails loudly on nothing here (lookups are dynamic), so the
  grep IS the check.
- [`SentText` bloats the ledger] → one composed prompt (~stored text + ~120-word
  wrapper) per briefed send, on a file that grows one line per send; accepted —
  and only the diff-from-raw case is stored (D4).
- [Full prompt text leaks to an ungated surface via the new endpoint] → the
  endpoint reuses the exact `GateClosed()` fence of `loops/detail`; the ungated
  projections keep receiving the raw `Prompt` through the existing `Text()`
  gate helper, unchanged.
- [Old audit lines render confusingly in the Queue audit view (no kind)] →
  pre-amendment lines have `Kind == ""` and are simply excluded from the
  queue-filtered view; the raw ledger remains their home. Stated in the view's
  empty-state copy.

## Migration Plan

Display-only change: backend emits a different event payload, frontend renders
it. Ship as one slice, verify on an isolated :5200 instance with the stub CLI
(arm a queue loop, watch the bubble equal the composed preview), then the
standard `swap.ps1` deploy + dead-man window. Rollback = redeploy previous
build; no stored data changes shape (audit/sent-history records are untouched).

## Open Questions

- None blocking. The only deferred nicety is the optional collapsed-wrapper
  styling (Non-Goal here).
