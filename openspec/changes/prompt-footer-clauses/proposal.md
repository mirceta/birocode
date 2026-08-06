# Proposal: prompt-footer-clauses

## Why

Some standing instructions must ride along on **every** turn sent to an agent, not
just once per session — the motivating case: the Harness drives Claude through
`claude -p`, so any process the agent starts dies when its turn ends unless it is
launched detached, and the agent only reliably respects that when the instruction is
repeated each turn. Today the operator has to remember to paste such reminders into
every single prompt by hand; forgetting one silently breaks the run.

## What Changes

- A new composer button in the agent-dock chat, sitting on the left side of the input
  row next to the existing custom-prompts (⚙) and expand (⛶) buttons, opens a
  **footer-clauses popup**.
- The popup manages a persistent **list of clauses**: add a new clause, edit or delete
  an existing one, and toggle each clause **active/inactive via a checkbox**.
- On every send from the composer, the **active** clauses are appended as a footer to
  the outgoing prompt — the operator types only their actual message; the standing
  instructions ride along automatically, every turn, until deactivated.
- Inactive clauses stay in the list (ready to re-activate) but are not appended.

## Capabilities

### New Capabilities

- `prompt-footer-clauses`: the clause list (add/edit/delete, per-clause active
  checkbox, persistence) and the send-time behavior of appending all active clauses
  to the footer of each prompt sent from the composer.

### Modified Capabilities

<!-- none — the chat capability's send/stream/resume requirements are unchanged; the
     footer append is an additive behavior owned entirely by the new capability -->

## Impact

- **Frontend** — `client/src/components/chat/ChatInput.jsx` (new toolbar button +
  popup mount), a new popup component (portal to `<body>` like `PromptManager`, so
  the small dock window doesn't shrink it), the send path in
  `client/src/context/ChatContext.jsx` (append active clauses at send time), a new
  context/store hook mirroring `PromptsContext`, `client/src/i18n/en.json`, and the
  capability map in `client/src/context/UiModeContext.jsx` (new UI defaults to
  **Advanced** per the repo convention).
- **Backend** — a small backend-synced store + endpoints for the clause list in
  `ClaudeWeb.App`, following the existing custom-prompts store pattern, so clauses
  survive restarts and sync across devices.
- **Adjacent behavior to respect** — chat bubbles / transcript rendering: appending
  the same footer to every turn repeats text in the visible user bubbles; the
  loop-agent-briefing work already solved the analogous problem with a `briefed`
  marker + affordance instead of repeated text, so design should decide whether the
  footer is shown verbatim or marked similarly.
