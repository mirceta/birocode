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

## 3. Honesty pass — stale wording

- [ ] 3.1 Grep code comments, `docs/`, and `understanding-app/` for claims that
      the chat bubble shows the stored text with a briefed affordance
      (loop-agent-briefing D3 wording) and update them to the new contract
      (chat = exact sent text; audit/sent-history = raw + flag + rev).
- [ ] 3.2 Sweep loop-eval scenarios and any Playwright/e2e assertions for
      expectations on the raw-text bubble or the briefed tag; update them to
      expect the composed text.

## 4. Verify

- [ ] 4.1 `npm --prefix client run build` and `dotnet build` (isolated dir per
      self-dev rules) pass.
- [ ] 4.2 On an isolated :5200 instance with the stub CLI: arm a drive-mode
      queue loop with one stash item; assert the chat user bubble text equals
      the composed preview (briefing frame + rules + contract line + item) and
      no 📝 tag renders; assert the step-verify bubble equals the sent verify
      composition.
- [ ] 4.3 Same instance: reload the conversation from the transcript and assert
      the reloaded user turn matches the live bubble byte for byte (headless
      Playwright per docs/claude-web/browser-testing.md).
- [ ] 4.4 Queue sent-history still shows the raw item text with the briefed
      badge; audit rows unchanged.
- [ ] 4.5 `openspec validate queue-loop-prompt-transparency --strict` passes.
