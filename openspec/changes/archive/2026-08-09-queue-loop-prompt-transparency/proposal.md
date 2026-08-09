# queue-loop-prompt-transparency — proposal

## Why

When a driven loop sends a prompt, the chat bubble shows only the raw stored text
plus a "📝 autopilot briefing attached" tag — the operator cannot read what was
actually sent to the agent without mentally reassembling frame + rules-at-rev +
footer clauses + contract line from other surfaces. In practice this makes the
chat feel deceptive, worst for the queue kind where the stored item is a terse
one-liner and the hidden wrapper dwarfs it; the goal loop only *feels* honest
because its stored text happens to be a full arm-time template. The chat is the
record of the conversation, so it must show the conversation verbatim.

## What Changes

- The synthetic `user` event for every driven loop send (queue item, queue
  step-verify, goal work/verify, recipe) carries the **exact composed text handed
  to the CLI** — briefing frame, enabled rules, footer clauses, contract line,
  separator, and stored text — not the raw stored text plus a `briefed` flag.
- The chat bubble renders that full composition; the "📝 autopilot briefing
  attached" affordance (`chat.briefedTag`/`chat.briefedTitle`) is removed. The
  bubble MAY present the wrapper part visually distinct (e.g. collapsed prefix),
  but the full text is always available in the chat itself.
- **Deliberate partial reversal of `loop-agent-briefing` D3**: the *chat* surface
  stops recording raw-text-plus-flag. The other D3 surfaces are unchanged — the
  audit log, queue sent-history, and state snippets keep the raw stored text with
  the briefed flag + rules revision (they are truncated operator lists, and
  `RecordQueueStep` must stay raw because the verify template quotes it back).
- Suggest mode is untouched (its pending prompt is raw by construction), and the
  suggestion kind's routine auto-sends remain unbriefed, so their bubbles already
  equal the sent text.
- **Queue audit (second amendment):** the durable audit ledger
  (`autopilot-audit.jsonl`) becomes a usable answer to "which prompts did the
  queue loop send?": entries gain the loop **kind** and **phase** (work/verify)
  so queue sends are distinguishable from goal/recipe/suggestion sends, and the
  **exact composed text** when it differs from the raw stored text. A gated
  **Queue audit** view on the dock loop card lists this repo's queue sends
  across arms (durable — unlike the per-arm sent-history, it survives re-arm),
  each expandable to the exact sent text.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `autopilot-loops`: the requirement "Briefed sends stay honestly disclosed
  without per-send noise" changes — the synthetic user event / chat bubble moves
  from raw-text-plus-affordance to the exact sent composition; audit and
  sent-history *list* projections stay raw. A new requirement makes queue-loop
  sends durably auditable: kind/phase-attributed audit entries carrying the
  exact sent text, browsable per repo behind the operator gate.

## Impact

- `ClaudeWeb.App/Services/Autopilot/AutopilotService.cs` — `SendPrompt` emits the
  composed `sendText` (not the raw `prompt`) in the synthetic user event.
- `client/src/context/ChatContext.jsx` — the `user` event handler no longer needs
  the `briefed` affordance path.
- `client/src/components/chat/MessageBubble.jsx` — drop or restyle the
  briefed tag; render the full text (optionally with the wrapper collapsed).
- `client/src/i18n/*.json` — retire `chat.briefedTag`/`chat.briefedTitle` or
  repurpose for the collapsed-wrapper affordance.
- Loop eval suite / e2e assertions that check the chat bubble shows the stored
  text with the briefed tag must be updated to expect the full composition.
- Replayed history: old runs' recorded user events carry raw text + flag; the
  client must keep rendering those sanely (backwards compatibility).
- `ClaudeWeb.App/Services/Autopilot/AutopilotAuditLog.cs` — `Entry` gains
  `Kind`, `Phase`, `SentText` (additive with defaults; old lines load unchanged).
- `ClaudeWeb.App/Controllers/AutopilotController.cs` — new operator-gated
  queue-audit endpoint (per repo, from the durable ledger).
- `client/src/components/dashboard/DockLoopControl.jsx` + i18n — the Queue
  audit view beside the existing per-arm sent-history.
