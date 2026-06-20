# Understanding — homepage topic: "Ask an agent to add a system test"

## Goal
Add a new **homepage explainer topic** (alongside "Use the Understanding app in
any agent") that hands the user a **copy-paste prompt template**. Pasting that
prompt into any agent working in this repo makes the agent (a) understand the
user wants a *new system test added*, and (b) know *exactly which* behaviour to
test and *how to reproduce* the problem.

## What the prompt template must capture (the three things asked for)
1. **Intent** — unambiguous "add a new black-box system test to the chat-systest
   suite" signal.
2. **Which test** — the specific behaviour/endpoint/scenario under test.
3. **How to reproduce** — concrete steps, the expected result, and the actual
   (buggy) result, plus where it should live / which suite.

## Concrete things I'll do
- New `homepage/assets/systest-topic.js` modelled on `understanding-topic.js`:
  an **interactive form** (WHAT / REPRODUCE / EXPECTED, plus an optional ACTUAL
  behind a "this is a bug" toggle) that **generates the paste-ready prompt live**
  as the operator types — no `<…>` placeholders to forget. Copy stays disabled and
  empty required fields are highlighted in the preview until answered. Then an
  animated strip of what the agent does, and a pointer to the on-disk convention.
- The prompt **points the agent at the single source of truth on disk**
  (`tests/chat-systest/README.md` + `plans/chat-system-tests.md`) so it writes
  the test the repo's way — isolated instance, `lib.mjs` helpers,
  `check()/report()`, one `.mjs` per scenario group, register in
  `hub/suites.json` — rather than copying that whole convention into the paste
  (same "pointer not copy, no drift" principle the Understanding-app topic uses).
- Register the new script in `homepage/index.html` load order.

## Assumptions
- This targets the existing **chat-systest** suite (the only system-test suite
  in the repo today).
- A form (operator supplies the bug specifics) generating a prompt that points
  at the convention for the HOW — because only the operator knows the bug, but the
  authoring convention already lives on disk. The form removes the risk of pasting
  an unfilled placeholder.

## Branch note
On `feature/systest-request-prompt`, based on `feature/chat-system-tests`
because the convention files this topic points at don't exist on `main` yet.
