# Migrating an in-flight `plan.md` feature to OpenSpec

**Agent-agnostic recipe.** Read this off disk if you land here after merging and
find the planning convention has changed under you. Any agent on this box can
follow it without extra context.

## Why you're reading this

Your branch was started under the **old** planning convention (`plans/<feature>.md`
+ the `plan.md` dashboard). Meanwhile the repo **adopted OpenSpec** as the planning
layer and merged it to `main`. So when you merge `main` into your branch you hit a
conflict — almost always in **`plan.md`** (the shared dashboard) and **`CLAUDE.md`**,
*not* in your own `plans/<feature>.md` (a new file doesn't conflict). Nothing is
broken; your feature's plan just needs to move into OpenSpec before you merge.

## What changed

| Old | New |
|-----|-----|
| `plans/<feature>.md` (prose plan, status header) | `openspec/changes/<feature>/` — a change folder |
| The feature's intent / "why" | `proposal.md` |
| The approach / design section | `design.md` |
| The checklist | `tasks.md` |
| Behaviour the feature adds | **delta specs**: `specs/<cap>/spec.md` (ADDED / MODIFIED / REMOVED) |
| Row in the `plan.md` dashboard | gone — `plan.md` is retired; `openspec list` is the dashboard |
| "what does it do today?" | `openspec/specs/` (the living baseline) |

The **Understanding app** (`understanding-app/`) is unaffected — keep building it
for non-trivial work exactly as before.

## Steps

1. **Create the change folder** — `openspec new change <feature>` (or `/opsx propose
   <feature>`). You get `openspec/changes/<feature>/`.
2. **Port the prose**, splitting your old `plans/<feature>.md` into:
   - `proposal.md` ← the intent / why + what changes (the restate-intent role).
   - `design.md` ← the approach and trade-offs.
   - `tasks.md` ← the checklist, as `- [ ]` items.
3. **Write the delta specs** — for each capability the feature touches, create
   `openspec/changes/<feature>/specs/<cap>/spec.md` describing only what changes, as
   **ADDED / MODIFIED / REMOVED** requirements diffed against `openspec/specs/`. Every
   requirement uses SHALL/MUST and carries at least one `#### Scenario:` (GIVEN / WHEN /
   THEN).
4. **Resolve the merge conflicts:**
   - `plan.md` — **take theirs** and delete your feature's row. The dashboard is
     retired; `openspec list` replaces it.
   - `CLAUDE.md` — **take theirs** (the OpenSpec convention).
5. **Delete your `plans/<feature>.md`** (it now lives as the change folder).
6. **`openspec validate --strict`** until clean.
7. **Finish the merge** and carry on. When the feature ships, `openspec archive
   <feature>` folds its delta into the baseline.

If you only have a stub plan and haven't really started, you can skip the porting and
just `openspec new change <feature>` fresh — same destination, less translation.
