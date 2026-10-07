# management-app — delta for goal-step-plan

## MODIFIED Requirements

### Requirement: Goal conversations live in one Subagents tab, not in the toolbar

The Management App's toolbar SHALL show exactly two arch tabs — the Operator-facing "Arch
agent" conversation and "Subagents" — however many goal conversations exist; a non-default
arch conversation SHALL never be its own toolbar tab, and a saved or deep-linked
per-conversation tab key from before this change SHALL land on Subagents with that
conversation selected. The Subagents tab SHALL list every non-default conversation in a
vertical, scrollable selector — each row with the repo agents' own status-dot component and
palette (pulsing turn, amber NEEDS_HUMAN or blocked step, green armed-between-polls, grey
finished), the exact state named in words, the goal's first line, the plan's done/total
fraction, iterations against the cap and the last poll — sorted attention first; the
selected conversation SHALL render in the same conversation view the Arch tab uses, with a
running goal's queued-message composer working and a finished one read-only, and with the
goal's STEP PLAN panel above it. Running goals (busy or held) SHALL offer Stop (the
stop_arch_goal path) and finished ones a per-device hide; newly started goals SHALL appear
without a reload, and the Subagents tab label SHALL carry the count of goals running,
waiting on the Operator or holding a blocked step.

#### Scenario: Five goals, two tabs

- **WHEN** five goal conversations exist in every state (turn running, NEEDS_HUMAN, polling, done, error)
- **THEN** the toolbar shows only "Arch agent" and "Subagents N" (N = running + needs-human + blocked), and all five appear as selector rows with the matching dot states and plan fractions, the running ones with Stop, the finished ones with hide

## ADDED Requirements

### Requirement: The step plan panel

For the selected goal the Subagents tab SHALL show its step plan as a vertical stepper
above the conversation: done = green with a check, active = pulsing accent, pending = grey,
blocked = amber with the question inline and — when the harness set the block from a
NEEDS_HUMAN ending — an answer box whose send clears the block and resumes the goal,
skipped = struck through; each step with its kind, its "done when" line while open, the
arch's note and its evidence compactly (the closing line in monospace, a PR / commit URL as a
link, hub path with size, job id); a done/total fraction and a headline (active step, blocked
count, derived, continued) on top. The Operator SHALL be able to mark a step from the panel
(the same path as the arch's `mark_step`, without the owner rule) and to continue an ended
goal from its plan. The panel SHALL update on the tab's live poll without a reload. A goal
without a plan SHALL say so plainly.

#### Scenario: The stepper changes state live

- **WHEN** the arch marks step 2 done with a hub path and step 3 active
- **THEN** within one poll the panel shows step 2 green with the hub row, step 3 pulsing, the fraction 2/n, and the selector row's fraction 2/n

#### Scenario: Answer a blocked step

- **WHEN** a goal is held on NEEDS_HUMAN and the Operator types an answer into the blocked step's box and sends
- **THEN** the harness reports the loop armed again and, on the next poll, the step is active and the row no longer says "needs you"
