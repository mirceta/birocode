## 1. Build

- [ ] 1.1 Client: browser mode stored per agent (dock tab id, else repo id) in
      `ChatContext.jsx`; `browserOn` / `setBrowserOn` resolved for the target; the old
      device-global `claude-web.browser-mode` flag removed on first load, not migrated.
- [ ] 1.2 Client: only the target agent's builder-lane sends carry `browser: true`; the
      🌐 toggle and its hint in `Chat.jsx` read the agent's own state; "held by {repo}"
      hint from `/api/chrome/status` shown only on agents whose toggle is on.
- [ ] 1.3 Server: `ChatController` documents and tests that a send without the flag never
      touches `ChromeGateService`; 409 `browser-busy` only for browser-enabled sends.
- [ ] 1.4 Tests: client node tests for the per-agent store (isolation, reload, retirement
      of the old flag); .NET tests for the gate path (non-browser turn accepted while held).
- [ ] 1.5 i18n en/tr for any new strings; capability map unchanged (`browserMode` stays Advanced).

## 2. Verify

- [ ] 2.1 .NET + client suites green; isolated :5200 instance with two docks in a headless
      browser (detached run, `@@CHROME-PER-AGENT@@` verdict line): A 🌐 on + run held,
      B 🌐 off prompts fine; B 🌐 on refused naming A; reload keeps each toggle; old flag
      retired; screenshots for the PR.

## 3. Ship

- [ ] 3.1 Commit on `feature/chrome-per-agent`, push, open the PR against main; merge and
      deploy on the Operator's word.
