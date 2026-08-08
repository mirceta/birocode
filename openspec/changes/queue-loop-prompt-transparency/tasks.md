# queue-loop-prompt-transparency — tasks

## 1. Backend — emit the composed text

- [ ] 1.1 `AutopilotService.SendPrompt`: the synthetic `user` event's `text`
      becomes `sendText` (the briefed composition when briefed, raw otherwise);
      drop `briefed`/`briefingRev` from the event payload; keep `actor: "loop"`.
      Update the D3 comment block above it to name this change.
- [ ] 1.2 Confirm no other consumer reads the `user` event's `briefed` field
      (grep server + client for `briefed` outside audit/sent-history surfaces);
      audit entry and `RecordQueueStep` keep raw text + flag + rev unchanged.

## 2. Frontend — render verbatim, retire the affordance

- [ ] 2.1 `ChatContext.jsx`: `user` event handler passes `evt.text` only;
      remove the `briefed` parameter from `addServerPrompt` and the `briefed`
      field from message objects; update the comment at the handler.
- [ ] 2.2 `MessageBubble.jsx`: remove the `briefed` prop and the `msg__briefed`
      span; update the header comment. `Chat.jsx`: stop passing `briefed`.
- [ ] 2.3 Remove the `.msg__briefed` rule from `chat.css`.
- [ ] 2.4 i18n: delete `chat.briefedTag` and `chat.briefedTitle` from `en.json`
      and `tr.json`; grep both keys to confirm zero references remain. Keep
      `dashboard.loopSentBriefed*` (sent-history badge is a kept surface).

## 3. Queue audit — durable ledger with exact sent text

- [ ] 3.1 `AutopilotAuditLog.Entry`: add `Kind` (default `""`), `Phase`
      (default `""`), `SentText` (default `null`) — additive so old `.jsonl`
      lines deserialize unchanged; update the class-summary comment.
- [ ] 3.2 `AutopilotService.SendPrompt` call path: stamp `loop.Kind`, the
      send's phase (work/verify from the propose bookkeeping), and
      `SentText = sendText != prompt ? sendText : null` on the audit entry.
- [ ] 3.3 New `GET /api/autopilot/loops/queue-audit?repoId=` in
      `AutopilotController`: `GateClosed()` fence (same as `loops/detail`),
      filters the ledger to the repo's queue-kind entries, newest first,
      bounded at 200; rows carry at/phase/raw text/exact sent text
      (`SentText ?? Prompt`). Entries with `Kind == ""` are excluded.
- [ ] 3.4 `DockLoopControl.jsx`: "Queue audit" affordance in the queue section
      beside the per-arm sent-history — gated fetch, rows collapsed to raw
      text + phase badge, expandable to full sent text; copy states the list
      is durable across arms and that pre-feature entries live only in the
      raw ledger. New i18n keys in `en.json` + `tr.json`.
- [ ] 3.5 Ungated surfaces unchanged: dashboard/console audit slices keep
      projecting the raw `Prompt` (spot-check the projections compile the new
      fields out or pass them harmlessly).

## 4. Honesty pass — stale wording

- [ ] 4.1 Grep code comments, `docs/`, and `understanding-app/` for claims that
      the chat bubble shows the stored text with a briefed affordance
      (loop-agent-briefing D3 wording) and update them to the new contract
      (chat = exact sent text; audit/sent-history lists = raw + flag + rev;
      durable audit = kind/phase + exact sent text behind the gate). Includes
      the queue-loop-visibility "full trail stays in the audit log" wording,
      which this change makes readable.
- [ ] 4.2 Sweep loop-eval scenarios and any Playwright/e2e assertions for
      expectations on the raw-text bubble or the briefed tag; update them to
      expect the composed text.

## 5. Verify

- [ ] 5.1 `npm --prefix client run build` and `dotnet build` (isolated dir per
      self-dev rules) pass.
- [ ] 5.2 On an isolated :5200 instance with the stub CLI: arm a drive-mode
      queue loop with one stash item; assert the chat user bubble text equals
      the composed preview (briefing frame + rules + contract line + item) and
      no 📝 tag renders; assert the step-verify bubble equals the sent verify
      composition.
- [ ] 5.3 Same instance: reload the conversation from the transcript and assert
      the reloaded user turn matches the live bubble byte for byte (headless
      Playwright per docs/claude-web/browser-testing.md).
- [ ] 5.4 Queue sent-history still shows the raw item text with the briefed
      badge; ungated audit rows unchanged.
- [ ] 5.5 Same instance: after the item + verify sends, assert the ledger's two
      new entries carry kind=queue, correct phases, and `SentText` equal to
      the chat bubbles; open the Queue audit view gated and assert both rows
      and their expanded text; disarm/re-arm and assert the rows persist while
      the per-arm list resets; with the gate closed assert the endpoint
      refuses.
- [ ] 5.6 `openspec validate queue-loop-prompt-transparency --strict` passes.
