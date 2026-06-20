# Understanding — full live feedback for the system tests

## Goal
Make a system-test run *show what it's doing* — not just emit terse
`[PASS]/[FAIL]` lines. Build the whole feedback experience, not a slice.

## What was built
1. **Narration (`say`)** in `lib.mjs` — a plain-language `→ ...` line that is
   commentary only (never affects pass/fail). It does double duty: a console line
   **and** a structured `narrate` event tagged with the current step index.
   `login()`/`startTurn()` narrate the shared actions; every scenario in all four
   suites opens with its intent.
2. **Live step list in the hub for BOTH modes** (`hub/public/`):
   - Each step streams its `say()` lines into a per-step **activity feed**
     (`.sfeed`) as it runs, shown beside that step's checks and observed line.
   - **Headless** runs now also show the step list (read-only — control bar
     hidden), so you watch steps tick by with their narration, instead of only a
     console dump. **Step-through** keeps the Next/Skip/Run-the-rest/Abort bar.
   - No server change needed — `narrate` events ride the existing `@@SYSTEST@@`
     channel the server already forwards.

## Verified
- `say()` emits `{type:"narrate", i:<step>, msg}` attributed to the right step.
- Headless browser drive of the hub (`.preview-test/systest-feedback-check.mjs`),
  **9/9**: interactive feed streams ≥2 narration lines on step 1 with the right
  human text; resolved step shows feed + 7 checks together; headless shows the
  list, hides the control bar, labels it "live run", narrates, and finishes
  21/21. Screenshots in `.preview-test/out/fb-*.png`.
- Found & fixed a real CSS bug: `.step-bar{display:flex}` overrode the `[hidden]`
  attribute, so the control bar wouldn't hide in headless — added
  `.step-bar[hidden]{display:none}`.

## Notes
- On `feature/systest-interactive` (builds on the chat-systest line, not yet on
  `main`).
- Console narration was committed first (9f84f87); the live-feed/headless-list
  layer is the change to commit next.
