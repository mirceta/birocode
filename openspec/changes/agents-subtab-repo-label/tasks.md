## 1. Build

- [x] 1.1 `client/src/manage/agentLabel.js`: pure `repoAgentLabel(handle, name, machine)` —
      strips the section's machine prefix whole (case-insensitive; a machine label may
      contain "/", a repo slug never does), else the part after the last "/", else the
      handle, else the name.
- [x] 1.2 `client/src/manage/FleetStatus.jsx`: the Agents-subtab chip renders that label;
      `data-handle` and the title keep the full `<machine>/<handle>`; the chip gets the
      section's machine label as a prop.
- [x] 1.3 `client/src/manage/agentLabel.test.mjs` under `npm --prefix client test`.
- [x] 1.4 Management App bundle rebuilt (`npm --prefix client run build:manage`).

## 2. Verify

- [x] 2.1 `client/tests/ui/shot-agents-subtab-label.mjs` (Playwright, mocked fleet with
      long machine names): before — 9 of 9 chips carry the prefix, 5 truncate; after —
      0 prefixed, 0 truncated, every chip's `data-handle` still starts with its
      machine, every machine header present, no page errors. Screenshots
      `docs/screenshots/agents-subtab-label-{before,after}.png`.
      DONE 2026-09-16.

## 3. Ship

- [ ] 3.1 PR against main; merge and deploy are the Operator's (the brief says do not
      merge, do not deploy).
