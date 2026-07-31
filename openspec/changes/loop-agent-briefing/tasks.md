# loop-agent-briefing — tasks

## 1. Backend: briefing composition at the send choke point

- [ ] 1.1 `LoopConfigStore`: briefing template consts — D2a draft v1 verbatim (work-phase
      core + per-kind contract lines; separate honesty-first verify note, NO act
      pressure) + `ComposeBriefedPrompt(kind, phase, sentinel, storedText)`; rework
      `GoalWorkTemplate`/`GoalVerifyTemplate`/`QueueVerifyTemplate` to drop lines the
      briefing now covers; delete the stale "byte-identical text" class-summary
      wording (D2, D2a, D4).
- [ ] 1.2 `AutopilotService`: wrap the proposed text with the briefing in the drive
      branch only — `SendPrompt` receives the composed text while `RecordQueueStep`,
      consume refs, state snippets, and audit keep the raw stored text; suggest branch
      untouched (D1, D3).
- [ ] 1.3 Record the briefed marker: `briefed: true` on the synthetic `user` event,
      briefed flag on audit entries and the queue sent-history projection (D3).

## 2. Disclosure: API + dock UI

- [ ] 2.1 Gated loop detail + arm preview endpoints expose the briefing template so the
      exact sent composition is reconstructable before arming (D3).
- [ ] 2.2 `DockLoopControl`: show the briefing in the arm preview; mark sent-history
      entries as briefed; chat bubble affordance for `briefed` loop sends in
      `ChatContext`/`Chat.jsx` + i18n/CSS.

## 3. Convention doc + honesty pass

- [ ] 3.1 `docs/loop-driven-agent-convention.md`: add the "How to behave" posture
      section, note that the loop now states the situation in every prompt, and amend
      the safety-posture paragraph to the deterministic-composition form (D4).
- [ ] 3.2 Honesty pass: grep docs/, understanding-app/, and code comments for the old
      "exactly the stored text" / "byte-identical" promise and update every hit;
      understanding-app reflects the briefed send flow.

## 4. Verify

- [ ] 4.1 Stub-CLI-simulator e2e on an isolated port: queue item, queue verify, goal
      work/verify, and recipe sends each carry the briefing (recipe with a custom
      sentinel cites it); suggest-mode pending text stays raw; an unaccomplished step
      still escalates as step-unverified.
- [ ] 4.2 Playwright on the isolated port: arm preview shows the briefing, sent-history
      shows raw text marked briefed, chat bubble shows the briefed affordance.
- [ ] 4.3 `openspec validate loop-agent-briefing --strict` green + builds green; commit
      on `feat/loop-agent-briefing`.
