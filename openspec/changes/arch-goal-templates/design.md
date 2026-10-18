# Design — arch-goal-templates

## The entry

```
Prompt (owner "arch") + Kind "goal-template"
  Purpose            "{agent} builds its own agentic app … on branch {branch} …"   (Text mirrors it: search, list tool)
  Inputs[]           { name, type, label?, default? }       type ∈ agent repo machine task goal branch text number
  Steps[]            { title, done?, kind }                  kind ∈ send wait transfer verify relay-loop human other
  MaxIterations?, Branch?, SourceGoalId?, Uses/LastUsedAt (shared with prompts)
```

The server validates: a name, a purpose, between 1 and 30 steps (blank titles dropped, an unknown kind becomes
"other"), and at most 12 inputs with unique lowercase names of known types. Update keeps the id, the uses and the
creation time; duplicate copies the plan and resets the uses.

## Flows

```
Subagents ─ 💾 save as template ─► draftFromGoal(goal) + generalisationCandidates(goal)
                                    └─ editor: generalise ✓ names → {inputs}; edit; Save → POST /api/prompts/templates
Prompts tab ─ Use ─► TemplateSheet
   inputs (pick lists from /api/arch, /api/taskgraph, /api/arch/conversations)
   └─ previewGoal(tpl, values) → GoalPlanPanel preview (live)
   ├─ 💬 Send to Arch chat → composeArchMessage → archHandoff → Arch composer (not sent)
   │      arch (role v21): propose, discuss, start_arch_goal(steps) on "start it"
   └─ ▶ Start now → startRequest → POST /api/arch/goals { goal, repos(agent keys), tasks, steps, maxIterations, startedBy:"arch" }
```

## Generalisation

Candidates:
- each driven agent, in all its forms (`MACHINE/repo#2`, `MACHINE/repo`, `repo#2`, `repo`; at least 3 chars);
- each card (8-char id);
- each branch the text or plan mentions (`feat/…`, `fix/…`, …).

Replacement goes longest form first across all chosen candidates, so "repo" never eats part of "MACHINE/repo".
The editor warns about `{placeholders}` that no input defines.

## The Arch-chat message

```
GOAL TEMPLATE "<name>" — propose it, we discuss it, start it only on my go.
Purpose: <filled>
Inputs: agent = prg#1 · branch = feat/x · …
Defaults: cap 40 · branch feat/x
Steps:
STEP 1 — [send] <title> — done when: <done>
…
(captured from goal <id>)
When I say "start it": start_arch_goal with goal = the purpose, the agents and cards in the inputs, the cap above, and steps = these STEP lines as { title, done, kind }.
```

The `STEP n — … — done when: …` form matches `ArchGoalPlans.ParseSteps`' line regex, so even pasted as goal text
the plan would be derived correctly. The arch is asked to pass the steps explicitly.

## Migration

`MigrateLegacyTemplates()` runs on store load. It converts the arch prompt whose id starts with `ccf3ee7d` (if it
is still a plain prompt) into `AgenticAppTemplate()`:
- the seven steps are the original's gates, with kinds wait / send ×5 / verify;
- the inputs are agent, purpose, examples (default "the harness's own agent apps"), branch and n (default 60);
- the source is goal d750eceb.

It keeps the id, uses and creation time. It is idempotent, and machines without that prompt are untouched.

## Evidence

- **.NET 1059/1059**, including `GoalTemplatesTests`: validation, add/update/duplicate, persistence, the
  migration.
- **Client 332/332**, including `goalTemplates.test.mjs`: defaults, live fill, preview goal, the Arch message,
  start request, generalisation with agent variants, body.
- **Lab on this hub** (`.claudeweb-preview/templab/lab.ps1`): an isolated harness with copies of the live
  prompts and goal records; the arch made harmless; zero send-type tool calls. **19/19**:
  - ccf3ee7d migrated;
  - finished goal d750eceb saved as a template (7 steps; card and branch generalised);
  - filling the inputs updates the stepper preview;
  - Send to Arch chat lands in the composer, not sent;
  - Start now creates a goal with exactly the filled plan, started by the arch.
