# Goals the Operator can name (fleet task 64dcb229)

## Why

Only the arch sees goal ids: they travel through its tool calls (`list_arch_goals`, `edit_goal_plan`,
`stop_arch_goal`). So the Operator cannot say "edit the step plan of the goal that built the Prompts tab"
precisely from the Arch chat. And the Subagents list keeps growing with finished goals that nobody looks at any
more.

## What changes

- **#ref chips.** Every goal row and the selected goal's header in the Subagents tab show the goal's 8-char id as
  a #ref chip (the Kanban card's look). A click copies the id; the tooltip carries the full conversation id and
  the goal's first line.
- **"💬 mention".** On a row and in the header, it switches to the Arch tab and inserts
  `goal 4ccefa45 (<short title>)` into the composer at the caret, focused, so the Operator can finish the
  sentence ("…add a step: …", "…stop it", "…continue it with cap 160"). The header does the same for the goal's
  board tasks (`task 5cc3e900 (title)`) and the agents it drives (their handle).
- **Goal ids in the Arch chat are chips.** Any "goal <id>" in an arch conversation renders as a chip that opens
  that goal in the Subagents tab: the finished-goal summary (`[goal <id> done …]`), the arch's replies, and
  NEEDS_HUMAN questions that name a goal.
- **`{goal}` placeholder kind.** Prompts get a `{goal}` placeholder that picks from the live goals (running and
  held first). Three curated seeds use it: add a step to a goal's plan, continue a goal with a new cap, stop a
  goal.
- **Active | All filter.** It sits at the top of the selector and defaults to Active:
  - **Active** shows goals that are running or held, anything busy or blocked, and anything with activity (a
    poll, a turn, a step change, an end) in the last hour.
  - **All** shows everything; its toggle carries the hidden count.
  - The choice is remembered per browser, and the Subagents tab's badge counts the Active set.
  - It is a client-side filter over what `/api/arch/conversations` already returns.

## Impact

- **Client:**
  - new `components/arch/goalRefs.js` (+ tests), `GoalRef.jsx`, `goalRefs.css`;
  - `subagents.js` gains the filter (+ tests);
  - `SubagentsPanel.jsx`, `ManageApp.jsx` (badge plus open-tab / open-goal events), `Arch.jsx` (composer ref,
    mention at the caret, goal chips in messages), `MessageBubble.jsx` (an optional `goalRefs` prop);
  - `archPrompts.js` + `PlaceholderChips.jsx` (`{goal}`).
- **Server:** three curated prompt seeds (`ArchPromptSeeds`). A re-seed adds them; nothing else changes.
- Independent of the open PRs #178 (Memory tab) and #179 (Prompts tab); based on main. With #179, both touch
  `archPrompts.js` and `ManageApp.jsx`: an additive merge.
