## ADDED Requirements

### Requirement: Goal templates are a kind of entry in the arch's prompt library
The arch's prompt library SHALL hold goal templates beside plain prompts: a name, category, one-paragraph purpose, typed inputs (agent, repo, machine, task, goal, branch, text, number), an ordered step plan whose steps have a title, a done-when and a kind (send, wait, transfer, verify, relay-loop, human, other), defaults (cap, branch), the goal it was captured from and a usage count; a template without a name, a purpose or a step, or with malformed or duplicate inputs, SHALL be refused with the reason.

#### Scenario: Saving a template
- **WHEN** a template with a purpose, two inputs and three steps is saved
- **THEN** it is stored in the arch library as a goal template and listed in the Prompts tab's Goal templates section

### Requirement: Any goal can be saved as a template
Every goal with a step plan in the Subagents tab, finished or running, SHALL offer "save as template": its text and plan become a draft, its concrete names (the agents it drives in every form they are named by, its cards, the branches it mentions) are offered for generalisation into inputs, and the Operator edits and saves the draft into the Prompts tab.

#### Scenario: Generalising a finished goal
- **WHEN** the Operator saves a finished goal that drove an agent on a branch for a card and keeps the offered names ticked
- **THEN** the template's purpose and steps carry {agent}, {branch} and {task} instead of the concrete names, and those are its inputs

### Requirement: A template is used with a live plan preview
Using a template SHALL show its inputs beside its plan drawn with the Subagents stepper; filling an input SHALL substitute it in the purpose and the steps immediately.

#### Scenario: Filling an input
- **WHEN** the Operator types an agent handle into the {agent} input
- **THEN** every step naming {agent} shows that handle in the preview

### Requirement: A filled template goes to the Arch chat or starts at once
"Send to Arch chat" SHALL insert the filled template into the Arch composer — purpose, inputs, defaults and numbered STEP lines with done-when — without sending it; "Start now" SHALL start a goal with exactly the filled step plan, the template's agents and cards and its cap, with the arch named as its starter.

#### Scenario: Discuss before starting
- **WHEN** the Operator presses Send to Arch chat
- **THEN** the Arch composer holds the GOAL TEMPLATE message and nothing has been sent

#### Scenario: Start now
- **WHEN** the Operator presses Start now on a filled template with two steps
- **THEN** a goal starts whose plan is those two steps, declared, started by the arch

### Requirement: The agentic-app prompt is the first goal template
The cached prompt "Agentic app goal: a repo agent builds its own harness app" (id ccf3ee7d) SHALL be converted in place into a goal template with its seven gated steps and the inputs agent, purpose, examples, branch and cap, keeping its id and usage.

#### Scenario: After the upgrade
- **WHEN** the hub starts with the new build and the prompt ccf3ee7d is a plain prompt
- **THEN** it is a goal template with seven steps and five inputs, same id
