# loop-agent-briefing — tasks

## 1. Backend: rules store + briefing composition at the send choke point

- [ ] 1.1 `BriefingRulesStore` (new, beside `LoopRecipeStore`): `briefing.json` via
      AppPaths with atomic temp+rename write + never-reseed-on-unreadable guard;
      model `{ rev, rules[{id,text,enabled}], revisions[] }`; seed the two D2a
      draft-v1 rules at rev 1 on first load; save = append prior state to
      revisions + bump rev (D2b).
- [ ] 1.2 `LoopConfigStore`: fixed-frame consts (header, situational statement,
      `NEEDS_HUMAN:` escalation line, per-kind contract lines, separator) + fixed
      verify note + `ComposeBriefedPrompt(kind, phase, sentinel, storedText, rules)`;
      rework `GoalWorkTemplate`/`GoalVerifyTemplate`/`QueueVerifyTemplate` to drop
      lines the briefing now covers; delete the stale "byte-identical text"
      class-summary wording (D2, D2a, D4).
- [ ] 1.3 `AutopilotService`: wrap the proposed text with the briefing in the drive
      branch only — `SendPrompt` receives the composed text while `RecordQueueStep`,
      consume refs, state snippets, and audit keep the raw stored text; suggest branch
      untouched (D1, D3).
- [ ] 1.4 Record the briefed marker + revision: `briefed: true` + `briefingRev` on the
      synthetic `user` event, on audit entries, and on the queue sent-history
      projection (D3).

## 2. API + dock UI: the always-visible Briefing editor

- [ ] 2.1 `AutopilotController`: `GET /api/autopilot/briefing` (rules + rev + frame
      text + composed work-phase preview) and `PUT /api/autopilot/briefing` (replace
      rules, server bumps rev) — session-authed, NOT gate-fenced (D2b).
- [ ] 2.2 Dock **Briefing** section beside the loop section on each dock card:
      collapsed "Briefing · N rules" line; expanded rules list with enable/disable,
      inline edit, delete, quick-add; composed preview + soft too-long hint; "global
      list" disclosure; capability `'advanced'`; i18n/CSS (D5).
- [ ] 2.3 Gated loop detail + arm preview expose the live briefing composition so the
      exact sent text is reconstructable before arming; `DockLoopControl` arm preview
      shows it; sent-history entries marked briefed (+rev); chat bubble affordance for
      `briefed` loop sends in `ChatContext`/`Chat.jsx` + i18n/CSS (D3).

## 3. Convention doc + honesty pass

- [ ] 3.1 `docs/loop-driven-agent-convention.md`: add the "How to behave" posture
      section, note that the loop now states the situation in every prompt, and amend
      the safety-posture paragraph to the deterministic-composition form (fixed frame
      + operator-edited rules at a recorded revision + stored text) (D4).
- [ ] 3.2 Honesty pass: grep docs/, understanding-app/, and code comments for the old
      "exactly the stored text" / "byte-identical" promise and update every hit;
      understanding-app reflects the briefed send flow with the editable rules list.

## 4. Verify

- [ ] 4.1 Stub-CLI-simulator e2e on an isolated port: queue item, queue verify, goal
      work/verify, and recipe sends each carry the briefing (recipe with a custom
      sentinel cites it); a rule added via PUT appears in the next send and the send
      records the bumped rev; a disabled rule does not appear; verify sends carry no
      rule lines; suggest-mode pending text stays raw; an unaccomplished step still
      escalates as step-unverified.
- [ ] 4.2 Playwright on the isolated port: dock Briefing section visible beside the
      loop section, quick-add + toggle round-trip, arm preview shows the composition,
      sent-history shows raw text marked briefed, chat bubble shows the briefed
      affordance.
- [ ] 4.3 `openspec validate loop-agent-briefing --strict` green + builds green; commit
      on `feat/loop-agent-briefing`.
