## Context

See proposal.md — Why. Verified state of the code (2026-08-07):

- **Engine (kind-agnostic, already correct):** `AutopilotService.cs` builds the loop
  context with `loop.DenyList ?? cfg.DenyList`, and the shared deny check in `ILoop.cs`
  judges every driven reply against it — queue, goal, and recipe alike.
- **Store:** `LoopConfigStore.StartQueue(…, List<string>? denyList)` persists a per-arm
  list (`CleanDenyList`); `StartGoal` and `StartRecipe` have **no deny parameter**, so
  those instances always carry `DenyList = null` (= global default).
- **API:** the single `/api/autopilot/loop` endpoint's `LoopRequest` already declares
  `List<string>? DenyList`; only the queue branch passes it. The instance projection
  already emits `loop.denyList` for any kind, gated.
- **UI:** `DockLoopControl.jsx` holds kind-agnostic chip state (`denyDefault` /
  `denyDropped`, hydration from the gated detail, `denyEffective`) lifted to the control's
  top level — but renders the chips only inside the queue arm section. The dock has one
  loop slot per agent, so "per arm" and "per dock" coincide at arm time.

So the engine and API need nothing; the store needs two parameter additions; the UI needs
the existing block **moved** to one shared render site.

## Goals / Non-Goals

**Goals:**
- One deny-controls block at the top of the expanded loop section, shown for all kinds —
  placement communicates "applies to every loop," fixing the misleading queue-only look.
- The trim rides on queue, goal, and recipe arms alike; armed instances disclose their
  effective list in the same shared spot (gated).
- Untouched arms keep `null` → global default; zero behavior change for existing loops.

**Non-Goals:**
- No changes to the deny matching rules, the global list editor (Autopilot console), or
  the gate model.
- No per-arm deny for suggestion-mode arms (they don't drive sends; classifier keeps the
  global default).
- No new endpoint, DTO field, or storage shape (all already exist).

## Decisions

**1. Move, don't duplicate: one shared `DenyChips` render site above the kind sections.**
Extract the deny-chip JSX (arming chips + armed effective-list display) into a local
`DenyChips` component rendered exactly once, at the top of the expanded loop section,
before the kind picker/sections. The queue section's copy is **removed**. The state
(`denyDefault`, `denyDropped`) already lives at the control's top level and hydrates from
the gated detail regardless of kind — so this is a render-site move, not a logic change.
- *Alternative — render the block per kind section (original plan):* rejected by the
  operator: the control is kind-agnostic, so kind-local placement misstates scope and
  multiplies render sites.

**2. Every driven arm payload includes the trim:** queue, goal, and recipe arms all send
`denyList: denyDropped.length > 0 ? denyEffective : undefined`. Untouched chips → field
omitted → instance stores `null` → global default (the spec's "Default fence untouched
elsewhere" scenario). Recipe must be included: with the shared placement, a recipe arm
that ignored the visible trim would recreate the original misleading-UI sin.

**3. `StartGoal` and `StartRecipe` gain a trailing optional `denyList` parameter** run
through the same `CleanDenyList` as queue; the controller passes `req.DenyList` at both
call sites. Suggestion start untouched.

## Risks / Trade-offs

- **[Queue regression] The chips leave the queue section** → the shared spot must show the
  armed queue instance's effective list exactly as before; browser-check the queue arm
  path explicitly (arm with a trim, inspect, resume).
- **[Hydration edge] A persisted trimmed arm must re-hydrate the chips on reopen** → the
  existing hydration (`mine?.denyList != null → derive dropped`) keys off the instance
  regardless of kind; verify for a goal arm, don't assume.
- **[Discoverability] Chips above the kind sections could read as global-list editing** →
  label the block explicitly as "this arm" scoped (i18n hint), distinct from the global
  editor in the Autopilot console.

## Migration Plan

Additive; ship with the normal `swap.ps1` deploy. Existing armed loops are untouched.
Rollback = redeploy previous build; persisted per-arm lists on goal/recipe instances are
simply ignored by an older build.
