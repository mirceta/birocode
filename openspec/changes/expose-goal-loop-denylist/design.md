## Context

See proposal.md — Why. Verified state of the code (2026-08-07):

- **Engine (kind-agnostic, already correct):** `AutopilotService.cs` builds the loop
  context with `loop.DenyList ?? cfg.DenyList`, and the shared deny check in `ILoop.cs`
  judges every driven reply against it — queue, goal, and recipe alike.
- **Store:** `LoopConfigStore.StartQueue(…, List<string>? denyList)` persists a per-arm
  list (`CleanDenyList`); `StartGoal(repoId, goal, maxIterations, mode, pin)` has **no
  deny parameter**, so goal instances always carry `DenyList = null` (= global default).
- **API:** the single `/api/autopilot/loop` endpoint's `LoopRequest` already declares
  `List<string>? DenyList`; only the queue branch passes it (`AutopilotController.cs:217`).
  The instance projection already emits `loop.denyList` for any kind, gated.
- **UI:** `DockLoopControl.jsx` holds kind-agnostic chip state (`denyDefault` /
  `denyDropped`, hydration from the gated detail, `denyEffective`) but renders the chips
  only inside the queue arm section, and only the queue arm payload includes `denyList`.

So the engine and API need nothing; the store needs a parameter; the UI needs the existing
block rendered in one more place.

## Goals / Non-Goals

**Goals:**
- Goal arms get the identical per-arm deny-trim affordance and semantics as queue arms.
- Armed goal instances disclose their effective list through the existing gated detail UI.
- Untouched arms keep `null` → global default; zero behavior change for existing loops.

**Non-Goals:**
- No recipe-arm deny controls (same asymmetry, deliberately out of scope — cheap follow-up).
- No changes to the deny matching rules, the global list editor, or the gate model.
- No new endpoint, DTO field, or storage shape (all already exist).

## Decisions

**1. Reuse the existing chip block by extraction, not duplication.** Lift the deny-chip
JSX in `DockLoopControl.jsx` (the `arming ? denyDefault.map(...)` block plus the armed
`loop.denyList` display) into a small local component (e.g. `DenyChips`) rendered by both
the queue and goal sections. The state (`denyDefault`, `denyDropped`) is already lifted to
the control's top level and hydrates from the gated detail regardless of kind — so one
state, two render sites, no divergence.
- *Alternative — copy the JSX into the goal section:* rejected; the block carries
  restore/drop titles, chip styling, and the armed-view variant — a copy will drift.

**2. Goal arm payload mirrors queue semantics exactly:** send
`denyList: denyDropped.length > 0 ? denyEffective : undefined`. Untouched chips → field
omitted → instance stores `null` → global default; this is the same contract the spec's
"Default fence untouched elsewhere" scenario pins.

**3. `StartGoal` gains a trailing optional `denyList` parameter** run through the same
`CleanDenyList` as queue; controller passes `req.DenyList` at the goal call site only.
Recipe call site untouched (non-goal).

## Risks / Trade-offs

- **[UI regression risk] The chip block moves out of the queue section** → extraction is
  mechanical JSX; verify both sections in the browser after the change (queue chips
  unchanged, goal chips new).
- **[Hydration edge] A persisted goal arm's trimmed list must re-hydrate the chips on
  reopen** → the existing hydration (`mine?.denyList != null → derive dropped`) already
  keys off the instance regardless of kind; covered once the goal instance can persist a
  list. Add this case to the browser check.
- **[Spec-compliance framing] The baseline requirement was already kind-agnostic** → the
  delta strengthens it with explicit goal scenarios so the gap cannot silently reopen.

## Migration Plan

Additive; ship with the normal `swap.ps1` deploy. Existing armed loops are untouched
(`DenyList` stays `null` unless a new arm trims terms). Rollback = redeploy previous
build; persisted per-arm lists on goal instances are simply ignored by an older build.
