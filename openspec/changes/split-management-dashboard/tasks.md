## 1. Client

- [ ] 1.1 Dashboard view switch: Execution | Management header tabs on the overlay
      AND the tab view; active view persisted per device; entry points reopen the
      last active view.
- [ ] 1.2 Management view: Arch surface (primary, component unchanged) + Ideas
      panel side by side; sensible narrow-viewport stacking.
- [ ] 1.3 Execution view: remove the Ideas and Arch chips from the panel rail
      (Autopilot + Agent-audit stay); drop the Arch pop-up plumbing that the rail
      summoned; keep pop-up mechanics for the remaining panels.
- [ ] 1.4 i18n (en + tr) for the view tabs; CSS.

## 2. Verification

- [ ] 2.1 `vite build` clean; `dotnet test` untouched-green.
- [ ] 2.2 Isolated Playwright: overlay opens on Execution by default; switching to
      Management shows the Arch surface and Ideas panel; Execution rail has no
      Ideas/Arch chips; view choice survives close/reopen; Basic mode unchanged.
- [ ] 2.3 Understanding app updated (done at propose time — the layer model page).

## 3. Ship

- [ ] 3.1 Deploy from feature/work; live check: both views render, Arch works from
      the Management view against the real fleet state.
