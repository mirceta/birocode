## 1. Build

- [x] 1.1 `agentLink.js`: the open-agent message / ack / event names, `findRepoForAgent`, `agentOfUrl`, `parseOpenAgentMessage`.
- [x] 1.2 `workerWindow.js`: `openPlan`, `isHarnessShellHref`; `focusOwnTab` reads the handle (self → release the name + fresh tab; fresh / parked → navigate; studio / cross-origin → message + ack wait + focus; none → blocked) and announces `birocode:agent-open`; `focusAgentTab(key, url, label, win)`.
- [x] 1.3 `DockContext.jsx`: `steerToAgent` shared by the `?agent=` deep link and the window-message listener, which acks.
- [x] 1.4 `FleetStatus.jsx`: labels for the opener; `OpenNotice` under the filters (`openNotice.js` texts); styles. Management bundle rebuilt.

## 2. Verify

- [x] 2.1 node: `agentLink.test.mjs` (plans, self-reopen, renavigate, steer + ack, cross-origin, blocked), `openNotice.test.mjs`; the whole client suite.
- [x] 2.2 Lab e2e on a copy of the live store, `.claudeweb-preview/open/verify.mjs`: pers-dec fresh / existing tab on another agent / dashboard in the named tab / parked tab / details button; a local and a remote agent. Screenshots `docs/screenshots/status-open-pers-dec-*.png`.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
