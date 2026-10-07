# One "Arch agent" tab + one "Subagents" tab — goal conversations stop being toolbar tabs

## Why

The Operator (2026-10-07, fleet task 592abffb): every goal conversation
(openspec arch-goal-conversations) opened its own tab in the Management App's
toolbar, beside the Operator-facing Arch tab. Five finished goals already
clutter the strip; with one goal per approved repo-agent request it would soon
take most of the space. Goal conversations must not be toolbar tabs at all.

## What Changes

- Exactly TWO arch tabs: **Arch agent** (the default conversation, unchanged)
  and **Subagents**. The per-conversation "arch:<id>" tabs are gone — for
  existing goals too; a saved or deep-linked old tab key migrates to Subagents
  with that conversation selected.
- The Subagents tab: a vertical, scrollable selector (one row per non-default
  conversation, goal conversations above all) on the left; the selected
  conversation on the right in the SAME view the Arch tab uses — a running
  goal keeps its queued-message composer and NEEDS_HUMAN answer path, a
  finished one reads back as it ran. Polling, queued messages, verification
  turn and the finished summary into the Arch conversation are untouched.
- Each row reuses the repo agents' AgentStatusDot (same component, same
  palette, same meanings): pulsing = a turn runs now; amber (claimed) =
  NEEDS_HUMAN waits on the Operator; green (free) = armed, idle between
  polls; grey (idle) = done/stopped/capped; faded = error — with the exact
  state always named by a badge word (error styled distinctly as text, no new
  dot colour). Rows carry the goal's first line (truncated), iterations/cap,
  last poll, queued count, and the NEEDS_HUMAN question; attention sorts
  first, then last activity.
- Running goals get **Stop** (the same stop_arch_goal); finished ones get
  **hide** (per device, nothing deleted). New goals appear in the list on the
  poll, and the Subagents tab label carries a count of running + needs-human
  goals so activity shows without opening it. The ＋ new-conversation button
  now lands its conversation in Subagents.
- Server side: the goal store and endpoints are unchanged; `GoalView` gains
  three additive fields (`stopReason`, `stopDetail`, `phase`) so the UI can
  tell "waiting on the Operator" from plain stopped and show the question.

## Impact

- Affected specs: `management-app` (ADDED requirement).
- Affected code: `ManageApp.jsx` (fixed tab strip + migration),
  `components/arch/SubagentsPanel.jsx` + `subagents.js` (pure, tested) + css,
  i18n keys, `ArchAgentService.Goals.cs` (three additive view fields).
- Evidence: `client/tests/ui/shot-arch-subagents.mjs` — before (5 per-goal
  tabs) / after (two arch tabs, count badge, dot palette, stop/hide,
  migration), 10/10 assertions, screenshots committed.
