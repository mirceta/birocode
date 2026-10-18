# Design — subagents-goal-refs

## The reference

The goal id (8 hex chars) is the one handle every goal tool already takes, so the UI shows it rather than
inventing a new one. A chip renders as `#4ccefa45`.

| Where | Chip action |
|---|---|
| Subagents row / header | click copies the id |
| Arch chat (any arch conversation) | click opens the goal in Subagents |

## Mention → composer

```
💬 mention (Subagents)
  └─ goalRefs.mentionInArch("goal 4ccefa45 (title)")
       ├─ sessionStorage['arch.pendingMention'] (the Arch tab is unmounted in tabs mode; it picks this up on mount)
       ├─ event 'arch:mention'                  (a mounted Arch composer takes it now)
       └─ event 'manage:open-tab' {tab:'arch'}  (ManageApp switches tab / un-hides the pane)
Arch.jsx (@arch, chat view): insertAt(draft, piece, caret) → focus → caret after the piece
```

`insertAt` adds a separating space only when needed. A caret is honoured only when the textarea really holds one
(a freshly mounted textarea reports 0, so the piece is appended).

## Chips in chat text

`MessageBubble` takes an optional `goalRefs` prop (only `Arch.jsx` passes it).

- **Plain text** (Operator messages, goal summaries posted as actor `goal`): split by `splitGoalRefs`.
- **Markdown** (the arch's replies): `linkGoalRefsMarkdown` turns "goal <id>" into `[goal <id>](#goal-<id>)`,
  skipping code spans and existing links. The link renderer turns `#goal-<id>` into a chip.
- A chip click fires `arch:open-goal`. ManageApp maps the id to its conversation and opens it in Subagents.

## Active | All

| Shown under Active | Rule |
|---|---|
| running, held (NEEDS_HUMAN), busy, a turn running, a blocked step | always |
| anything else | `now − lastSignOfLife < 1 h`, where lastSignOfLife = max(lastSentAt, endedAt, startedAt, createdAt, any step's updatedAt) |

- Remembered in `localStorage['manageapp.subagentsFilter']`, default `active`.
- The badge uses `activeSubagentCount` (the same rule), replacing the old attention count.
- The per-row "hide" (per device) stays as it was, on top of the filter.

## `{goal}` placeholder

`placeholderKind('goal')` returns `'goal'`. `optionsFor('goal')` lists the goals from `/api/arch/conversations`:
running first, then the most recent. The label carries the id, the first line, and "waiting on you" or the
state. `PlaceholderChips` fetches the goals only when a `{goal}` chip appears.

## Evidence

- `goalRefs.test.mjs`: mention text, ref splitting, markdown links, caret insert, the event bus.
- `subagents.test.mjs`: the Active rule, the filter, the badge count, the remembered choice.
- `archPrompts.test.mjs`: `{goal}` options. Client suite 305/305; .NET 977/977.
- Lab on this hub (`.claudeweb-preview/goallab/lab.ps1`, an isolated harness): the copied goal records with the
  arch made harmless (no managed repos or fleet, no loops, no collector sources; zero send-type tool calls
  logged). **21/21**:
  - Active 3 vs All 23, "All · 20 more", badge 3, the choice remembered;
  - copy an id;
  - mention → composer focused at the caret;
  - `{goal}` options;
  - a real arch reply's goal id rendered as a chip that opened the goal.
