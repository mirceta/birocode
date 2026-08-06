## 1. Two-level nav in AutopilotConsole

- [x] 1.1 Replace the flat `tab` state with `root` + per-root `sub` map; render
      the 5-entry root row (Overview, Suggestion-based loop, Goal-based loop,
      Audit, Reference) and the subtab rows for the three grouped roots, with
      badges re-homed (active loops → Goal-based loop root, prompt count →
      Prompt library subtab, audit count → Audit root).
- [x] 1.2 Re-home the views under the new conditions: Control = `AgentsView`,
      Prompt library / Live feed / History / Audit = the existing inline blocks,
      Reference = the two explainers + `SystemTestsView`; keep Overview outside
      the gate fence and everything else inside it; re-key the prompts lazy-load
      to the Prompt library subtab.
- [x] 1.3 `LoopsView`: add the `section` prop (`'agents' | 'recipes'`) and render
      only that section (intro paragraph on both); wire the two Goal-based loop
      subtabs to it.

## 2. Audit kind column + CSS

- [x] 2.1 Audit rows: badge from `e.outcome` — `loop` gets a distinct "loop"
      badge, everything else stays "sent".
- [x] 2.2 Add `ap-subtabs` styles to `pages/autopilot.css` (lighter sibling of
      `ap-tabs`).

## 3. Verify

- [x] 3.1 Build the client; run the harness on an isolated port; Playwright:
      walk all 5 root tabs + every subtab (routed tab and dashboard dock),
      assert gate-off still shows Overview + full nav, screenshot.
- [x] 3.2 `openspec validate restructure-autopilot-tabs --strict`; update
      `understanding-app/` to reflect the new hierarchy; honesty pass on
      Overview/summary copy that names tabs.
