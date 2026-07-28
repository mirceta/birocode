# unify-loop-types

## Why

The loop type shipped as "🎯 goal-based" is mislabeled: it resends a fixed
recipe prompt (the OpenSpec-change driver ritual) and trusts the agent's own
`LOOP_DONE` claim — the user never states a goal and nothing checks one. On top
of that, suggestion-arming and a loop can be armed on the same agent at once
(only a runtime precedence rule keeps them from double-sending), and the dock
popover stacks two independent sections instead of offering one clear choice.
The result is a confusing control surface over a sound engine.

## What Changes

- **Rename** the existing fixed-prompt loop type to **📋 recipe loop**
  everywhere (dock, console, docs, understanding-app): it drives a stored
  ritual prompt (e.g. "Drive the OpenSpec change") until the agent's own
  done-claim. Seed recipes are renamed to say what they drive; a planted seed
  that is still byte-identical to the old seed text is migrated to the new
  name (user-edited copies are never touched). **BREAKING** for UI labels
  only; the engine and stored loops keep working.
- **Add a real 🎯 goal loop**: the user states a free-text goal; the server
  composes (and stores verbatim) a work prompt and a verification prompt from
  it; the engine drives work turns until the agent claims done, then sends the
  verification turn — the loop resolves `done` only on a verified confirmation
  (`GOAL_VERIFIED`), otherwise the gaps feed the next work turn.
- **XOR arming per agent**: at most one autopilot mode (suggestion | recipe
  loop | goal loop) armed per repo, enforced server-side in one coordinator —
  arming one mode disarms the others. The engine's runtime precedence stays as
  defense-in-depth.
- **Unified dock loop control**: one popover with a type picker (💡/📋/🎯),
  per-type parameters, inspection of the exact prompt(s) that will be
  (re)sent, and a single Disarm for whatever is armed. The dock badge shows
  the one armed mode, typed by kind.
- **Prompt inspection endpoint** (operator-gated): full loop detail — prompts,
  goal text, recipe prompt bodies, goal templates — for the popover's
  inspection panes. The ungated status projection gains only `kind` and
  `phase` (still no prompt text).

## Revision 2 — one interface, one store, one mode axis

User feedback on the first cut: the loop types are still "vastly different" —
suggestion arming lives in a different store with a *global* auto-advance flag,
XOR needs a coordinator class to hold two stores together, and the dock section
stays ambivalent about what is armed and whether it acts. Revision 2 remodels:

- **One OOP model**: an `ILoop` interface (`Kind` + `Decide(context)`), with
  `SuggestionLoop`, `RecipeLoop`, and `GoalLoop` as its implementations. The
  engine stops special-casing kinds: it resolves the agent's one loop instance,
  asks the implementation for a decision, and executes it.
- **One store, one record**: every armed mode is a **loop instance** in
  `LoopConfigStore` — `{ kind, mode, armed(active), params, status }`, keyed by
  repo. Suggestion arming migrates out of `autopilot.json` (`ArmedRepoIds` +
  global `AutoAdvance` are drained into per-agent suggestion instances once).
  XOR becomes **structural** — one slot per agent — and the `AutopilotArming`
  coordinator is deleted.
- **One common mode axis**: every loop has `mode: suggest | drive`. A loop's
  job is to determine the agent's **next prompt**; in *suggest* mode that
  prompt is surfaced as a pending suggestion pre-filling the dock chat's
  composer, in *drive* mode it is actually sent (capped + audited). What was
  the suggestion loop's private auto-advance flag becomes a property of every
  loop — a recipe or goal loop can now run human-paced.
- **One dock section**: the loop control's header names this agent's loop type
  and armed state; expanding shows its parameters, the armed toggle, the
  suggest/drive toggle, status, prompt inspection, and the pending suggestion.

## Capabilities

### New Capabilities

_None — all changes land in existing capabilities._

### Modified Capabilities

- `autopilot-loops`: loops gain a kind (recipe | goal); goal loops add a
  verification phase and verified-done stop semantics; arming becomes XOR
  across autopilot modes; the ungated projection adds kind/phase; a gated
  detail read adds prompt inspection.
- `agent-dock`: the dock loop control becomes one unified type-picker popover
  (replacing the two stacked sections), with per-type parameters, prompt
  inspection, and a single disarm; the badge shows the single armed mode.
- `loop-recipes`: seed recipes renamed to name their ritual; a byte-identical
  planted seed migrates to the new name once (edited/deleted seeds untouched).

## Impact

- Backend: `LoopConfigStore` (kind, goal, phase, verify prompt),
  `AutopilotService.HandleLoop` (goal-kind verify state machine), new
  `AutopilotArming` coordinator (XOR), `AutopilotController` (loop arm API
  gains kind/goal, new gated detail endpoint, ungated projection + kind/phase),
  `LoopRecipeStore` (seed rename + migration).
- Frontend: `DockLoopControl.jsx` (unified rewrite), `LoopsView.jsx`,
  `AutopilotOverviewView.jsx` naming, `PinnedAgent.jsx` badge wiring,
  `autopilot.css`/`dashboard.css`, i18n keys.
- Docs: `docs/loop-driven-agent-convention.md` gains the goal-loop
  verification contract (`GOAL_VERIFIED`); understanding-app honesty pass.
- Data: `loops.json` gains additive fields (old entries load as recipe-kind);
  `loop-recipes.json` untouched except the guarded seed-name migration.
