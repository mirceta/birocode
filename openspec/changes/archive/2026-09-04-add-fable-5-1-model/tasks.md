# Tasks

## 1. Implementation
- [x] 1.1 Update the global Claude Code CLI on the box (npm) and verify
      `claude-fable-5-1` is recognized (no `unrecognized_model` warning,
      contextWindow 1000000 in `modelUsage`) — done, 2.1.252 → 2.1.258.
- [x] 1.2 Add `{ id: 'claude-fable-5-1', label: 'Fable 5.1' }` as the first
      entry of `MODELS` in `client/src/components/chat/ModelSelector.jsx`.
- [x] 1.3 Rebuild the frontend and confirm the bundle carries the new entry
      (grep of `dist/assets` hits "Fable 5.1").

## 2. Verify & ship
- [x] 2.1 Deploy via `swap.ps1`; verify on live :5099 in a real browser that
      the dropdown lists Fable 5.1 and it is the default when no model is
      saved — deployed 2026-09-02 08:49 (`-NoArm`, autonomous run; health 200,
      lastgood snapshot taken), verified with
      `.claudeweb-preview/playwright/check-fable51-live.mjs` (PASS + screenshot).
- [x] 2.2 Push branch + open PR (main is merge-protected; user merges) —
      PR #54.
