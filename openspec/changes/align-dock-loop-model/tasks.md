# Tasks — align-dock-loop-model

## 1. Backend

- [x] 1.1 `AutopilotController.Loops()`: add `suggestionArmedRepoIds`,
      `autoAdvance`, `suggestionEnabled` to the ungated projection (status only).

## 2. Frontend

- [x] 2.1 `Dashboard.jsx`: derive per-repo suggestion status from the existing
      loops poll and pass it through `PinnedAgent` to `DockLoopControl`.
- [x] 2.2 `DockLoopControl.jsx`: two labeled sections (💡 suggestion-based with
      arm/disarm + state, 🎯 goal-based framing the recipe picker under a
      "Recipes" label); suggestion arm via gated `POST /autopilot/config`
      with the existing 403 gate-hint handling.
- [x] 2.3 Typed badge row: 🎯 prefix on the goal-loop badge, 💡 marker while
      suggestion-armed.
- [x] 2.4 `dashboard.css` section styles + `en.json`/`tr.json` labels.

## 3. Verify

- [x] 3.1 `openspec validate align-dock-loop-model --strict`.
- [x] 3.2 Build client + isolated harness; Playwright
      `verify-dock-loop-model.mjs`: popover shows both sections with captions,
      recipe under the goal section, suggestion arm round-trip flips state,
      badge typing; screenshot read before claiming success.
- [x] 3.3 Understanding app honesty pass.
