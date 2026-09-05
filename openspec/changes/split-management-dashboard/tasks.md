## 1. Client

- [x] 1.1 Dashboard view switch: Execution | Management header tabs on the overlay
      AND the tab view; active view persisted per device; entry points reopen the
      last active view.
- [x] 1.2 Management view: Arch surface (primary, component unchanged) + Ideas
      panel side by side; sensible narrow-viewport stacking.
- [x] 1.3 Execution view: remove the Ideas and Arch chips from the panel rail
      (Autopilot + Agent-audit stay); drop the Arch pop-up plumbing that the rail
      summoned; keep pop-up mechanics for the remaining panels.
- [x] 1.4 i18n (en + tr) for the view tabs; CSS.

## 2. Verification

- [x] 2.1 `vite build` clean; `dotnet test` untouched-green.
- [x] 2.2 Isolated Playwright: overlay opens on Execution by default; switching to
      Management shows the Arch surface and Ideas panel; Execution rail has no
      Ideas/Arch chips; view choice survives close/reopen; Basic mode unchanged.
      DONE 2026-09-05: `.claudeweb-preview/mgmt-e2e.ps1` → check-mgmt-layer.mjs, 12/12
      (opens on Execution · no Ideas/Arch chips · Management mounts Arch + Ideas ·
      Execution body unmounted · layer persists · no JS errors).
- [x] 2.3 Understanding app updated (done at propose time — the layer model page).

## 3. Ship

- [ ] 3.1 Deploy from feature/work; live check: both views render, Arch works from
      the Management view against the real fleet state.
