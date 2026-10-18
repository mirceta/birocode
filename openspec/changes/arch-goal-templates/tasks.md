# Tasks — arch-goal-templates

- [x] Prompts store: the goal-template kind (purpose, typed inputs, step plan, defaults, source goal), validated add / update endpoints.
- [x] Subagents: "save as template" on any goal with a plan — draft from the goal, generalise concrete names into inputs, edit, save.
- [x] Prompts tab: a Goal templates section; Use = input fields beside the stepper preview (GoalPlanPanel `preview`), live fill.
- [x] Send to Arch chat (structured STEP lines into the composer, not sent); role prompt v21: propose, discuss, start on the Operator's go.
- [x] Start now (POST /api/arch/goals with the declared plan, `startedBy: "arch"`).
- [x] Migrate the cached prompt ccf3ee7d into the first goal template.
- [x] Tests (.NET + node), full suites green; lab on this hub 19/19 with screenshots; Understanding app.
- [ ] Operator: after merge + deploy, open Prompts → Goal templates → Agentic app goal → Use.
