## 1. Build

- [x] 1.1 Opener: `openAgentHarness({…, app})`, `&app=` in the deep link, `app` in the open-agent message (per-agent tab + launcher); unknown app → open without it + toast.
- [x] 1.2 Agent side: `?app=` / message → the matching dock selects the app once its list loads; not there → toast.
- [x] 1.3 Apps in the peer describe, the fleet status and `list_agents`.
- [x] 1.4 Recurring tab: tracking cards open with their app; the editor's picker lists any agent's apps.
- [x] 1.5 Arch: `create_recurring` / `update_recurring` resolve `appId` by id or name; guidance (role v19) + tool text.

## 2. Verify

- [x] 2.1 Client 295/295 (agentLink, openAgent, recurringCards, openNotice tests added); .NET RecurringAppRefTests + arch/recurring suites green.
- [x] 2.2 Lab on the hub (two isolated harnesses from this branch, copies of the live store): 22/22 —
  card 5f3670e4 set to `admin` through the picker; open → agent tab with admin selected; tab already open
  on `hook` → same tab back on admin, no reload, no second tab; an app that is gone → toast; a card on the
  peer's msg-platform-agent: picker lists the peer's apps, open → peer harness with admin, re-open from
  `gdpr` → back on admin (cross-origin message).
- [ ] 2.3 Live after deploy: set the real card 5f3670e4's app to admin (the picker, or the arch's update_recurring).

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
