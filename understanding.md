# Understanding — serving model clarity (slice 2: guided exposure flow)

## Goal

Build the **guided exposure flow inside the helper** (the served `exposer/`
product), so an agent opens the Local tab and the helper itself walks them
through getting their product correctly exposed — reusing the existing
`/api/expose/check` probe as the engine (not rebuilding it).

## What I'll do

1. **Backend — one new field.** Add a `Why` (plain-language, contract-anchored
   explanation) to `ExposeService.Check`, populated per rule. This keeps the
   "live contract" single-sourced in the backend (same principle as
   `BuildFixPrompt`), so the helper never carries a stale copy. Rides along the
   existing `/api/expose/check` response automatically.

2. **Helper — the guided UI** (vanilla JS/CSS in `exposer/`, still fully
   relative-URL + root-served so it stays its own "done right" reference):
   - Keep the existing "this page is itself correctly exposed" proof.
   - Add a **Run / re-run exposure check** button that calls
     `/api/expose/check` and renders the per-rule checklist: ✓/✗, label, probe
     detail, the **why** (live contract), and the fix when failing.
   - **One-click "Fix with an agent"**: `postMessage` to the parent harness to
     prefill the project chat + jump to the agent; clipboard-copy fallback when
     opened outside the Local tab (no parent).

3. **Harness bridge** (small): in `LocalApp.jsx`, listen for the helper's
   same-origin `postMessage` and call the existing `prefillProjectChat` +
   navigate — the same one-click path `ExposeCheck.jsx` already uses.

## Assumptions

- The helper is used via the Local tab (same-origin proxy), so `/api/expose/check`
  is reachable and the session cookie flows; a direct load degrades gracefully.
- The existing chrome `ExposeCheck` panel stays — the in-helper flow is the
  served-product surface the plan calls for, not a replacement.
- Following the active repo (`repoId`-aware check) is **slice 3**, not now.

## Status

**Done — verified 14/14** on an isolated preview. Backend `Why` field added and
single-sourced; helper renders the guided checklist (rows + live-contract why +
all-green summary + hidden fix area); the one-click fix posts to the harness
(`LocalApp` bridge, same-origin guarded) which prefills the project chat and
navigates to the agent. Slice 3 (repo-aware check) is next, not started.
