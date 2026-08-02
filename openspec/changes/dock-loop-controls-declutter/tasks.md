## 1. Dock header — the Drive checkbox

- [x] 1.1 In `DockLoopControl.jsx`, add the Drive checkbox to `phone__loop-row`
      (right-aligned after the ⟳ summary button, visible collapsed and
      expanded): `checked` = the existing derived `mode === 'drive'`,
      `onChange` routes to `setLiveMode` when `armedKind === selected`, else
      `setPickedMode`; disabled while `busy`; tooltip from
      `dashboard.loopModeHint.*`
- [x] 1.2 Move the `gateHint` and `err` message blocks out of the popover-only
      subtree so a collapsed-row checkbox flip that 403s/fails renders its
      hint under the header row (design D3)
- [x] 1.3 Delete the `phone__loop-modes` radiogroup and the mode-hint
      paragraph from the popover

## 2. Dock popover — prose out, pointer in

- [x] 2.1 Remove the per-kind description paragraph (`dashboard.loopDesc.*`
      render) from the popover; add the single pointer line
      (new `dashboard.loopMoreInfo` key) naming Autopilot → Loops
- [x] 2.2 i18n: add `dashboard.loopDriveCheck` + `dashboard.loopMoreInfo` to
      `en.json` and `tr.json`; keep `loopDesc.*` / `loopModeHint.*` keys
      (reused by the console block and tooltip)
- [x] 2.3 CSS (`dashboard.css` dock loop styles): flex the header row with the
      checkbox pushed right; style `phone__loop-drive` to match dock chrome

## 3. Console — the relocated reference block

- [x] 3.1 Add the static "What a loop is" reference block at the top of
      `LoopsView.jsx`: four kinds (💡📋🎯🗒️) each with their
      `dashboard.loopDesc.*` copy, plus the suggest-vs-drive contrast from
      `dashboard.loopModeHint.*`; no backend call
- [x] 3.2 Style the block in `autopilot.css` consistent with existing console
      sections

## 4. Verify

- [x] 4.1 `npm --prefix client run build` clean
- [x] 4.2 Headless browser check against an isolated preview: collapsed header
      shows the checkbox; popover has no mode radiogroup and no kind/mode
      description paragraphs but keeps queue binding + verify + deny
      disclosures; console Loops tab renders the reference block
- [x] 4.3 `openspec validate dock-loop-controls-declutter --strict` passes
