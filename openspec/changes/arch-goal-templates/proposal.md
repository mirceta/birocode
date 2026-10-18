# Goal templates: a stored, parameterised step plan (fleet task 545b9548)

## Why

A cached prompt that encodes a whole goal conversation is a wall of text. Example: the stored "Agentic app goal: a
repo agent builds its own harness app" (id ccf3ee7d, captured from goal d750eceb) is seven gated steps packed into
one paragraph. The Operator wants a second kind of Prompts-tab entry, one that is a step plan: you can see it, fill
it, preview it, talk it over with the arch, and start it.

## What changes

- **A second entry kind in the prompts store** (`kind: "goal-template"`, owner arch, same file and same usage
  counter):
  - name, category, purpose (one paragraph);
  - typed inputs: agent | repo | machine | task | goal | branch | text | number — the Prompts tab's placeholder
    types;
  - an ordered step plan with the goal plan's shape: title, done-when, kind send | wait | transfer | verify |
    relay-loop | human | other;
  - defaults (cap, branch) and the goal it was captured from.
  - `POST /api/prompts/templates` and `PUT /api/prompts/templates/{id}` validate it (name, purpose, ≥ 1 step,
    well-formed unique inputs).
- **Save as template** on any goal in the Subagents tab, finished or running:
  - the goal's text and step plan become a draft;
  - its concrete names (the agents it drives, in every form they are named by, its cards, the branches it
    mentions) are offered for generalisation into `{inputs}`;
  - the Operator edits the draft and saves it to the Prompts tab.
- **Template view** in the Prompts tab: a "🧭 Goal templates" section. Each template's **Use** shows the input
  fields (live pick lists for agents, machines, cards, goals) beside the plan, drawn with the Subagents tab's
  stepper (`GoalPlanPanel`, new `preview` mode). Filling the inputs updates the purpose and the steps live.
- **Send to Arch chat** inserts the filled template into the Arch composer, without sending it:
  - a `GOAL TEMPLATE "<name>"` heading, then Purpose, Inputs and Defaults;
  - numbered `STEP n — [kind] title — done when: …` lines, which the server's step parser already reads;
  - the propose → discuss → start protocol.
  - Role prompt **v21** tells the arch: a goal template arriving in chat means propose and discuss, then
    `start_arch_goal` with the declared steps only on the Operator's go.
- **Start now** starts the goal directly from the tab with the declared plan. The agent inputs map to agent keys
  and the task inputs become the goal's cards, with the template's cap. `POST /api/arch/goals` takes an optional
  `startedBy: "arch"`, so the arch is named as the starter.
- **Migration:** the cached prompt ccf3ee7d is converted in place (same id, same uses) into the first goal
  template: seven gated steps, and inputs agent, purpose, examples, branch, cap.

## Impact

- **Server:**
  - `PromptsService` (now partial) + `PromptsService.Templates.cs`, `PromptsController` (templates
    endpoints);
  - `ArchController` (`GoalRequest.StartedBy`), `ArchAgentService` role prompt v21 (+ four version pins);
  - tests: `GoalTemplatesTests`.
- **Client:**
  - `goalTemplates.js` (+ tests), `TemplateEditor.jsx`, `TemplateSheet.jsx`, `goalTemplates.css`;
  - `GoalPlanPanel` (`preview`), `PromptsTab` (templates section), `SubagentsPanel` (save as template),
    `ArchPromptPicker` (templates are used from the tab, not inserted raw).
