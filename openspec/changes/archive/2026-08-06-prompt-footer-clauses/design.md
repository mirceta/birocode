# Design: prompt-footer-clauses

## Context

The composer (`client/src/components/chat/ChatInput.jsx`) already has a left-side
button cluster: attach (+), custom prompts (⚙, `PromptManager` modal), expand (⛶,
`PromptExpandModal`). All composer sends funnel through `ChatContext.sendTo`
(`client/src/context/ChatContext.jsx`), which already amends the outgoing text once
(the `[Attached file: …]` suffix) before POSTing `/chat`. Custom prompts are stored
globally in `%APPDATA%\ClaudeWeb\prompts.json` via `PromptsService` +
`PromptsController` (atomic temp+rename writes, never-reseed-on-unreadable load).
The motivating clause is harness-global ("you run under `claude -p`, launch
survivors detached"), not repo-specific.

## Goals / Non-Goals

**Goals:**
- A clause list managed from a popup on the composer, each clause toggleable, persisted globally.
- Active clauses appended as a delimited footer to every composer-originated send.
- Visible active-state on the button so silent amendment never surprises the operator.

**Non-Goals:**
- Autopilot loop sends — the loop engine has its own briefing wrapper (loop-agent-briefing); this feature is composer-only.
- Per-repo or per-dock clause lists (see Decisions; revisit if a repo-specific clause shows up in practice).
- Hiding the footer from the user bubble (see Trade-offs).

## Decisions

1. **Append client-side in `sendTo`, not in the backend.** `sendTo` is the single
   funnel for every composer send (typed submit, approved queue chip) and already
   has an amend-before-send precedent (attachment suffix). Backend appending would
   also catch loop-engine sends — explicitly unwanted — and would need the clause
   state threaded into `SessionService`. Client-side keeps the blast radius to one
   function. Consequence: the appended footer is part of `fullText`, so it lands in
   the user bubble and session history verbatim (see Trade-offs).

2. **Global store, `FooterClausesService` mirroring `PromptsService`.** New
   `footer-clauses.json` in the same data dir, same atomic-write + load-guard
   pattern, `Clause(Id, Text, Active)` records, thin `FooterClausesController`
   (list/add/update/delete — update covers both text edits and the checkbox).
   Global because the motivating clause is about the harness's own invocation
   mode, which is identical for every repo, and because the sibling store
   (prompts) is already global — same mental model.

3. **New `FooterClausesContext` mirroring `PromptsContext`,** loaded once and
   shared, so `ChatInput` (popup UI) and `ChatContext` (send-time read) see the
   same list without prop-drilling. Send-time read uses the context's current
   state; no refetch per send.

4. **Footer format: one delimited block.** Typed message, blank line, a fixed
   delimiter line (e.g. `--- standing instructions ---`), then each active clause
   in list order. A recognizable delimiter keeps the agent from confusing standing
   instructions with the actual ask and gives a future bubble-marker feature a
   string it can detect. Exact wording is an implementation detail; keep it a
   shared constant.

5. **New UI is `'advanced'`** in `UiModeContext.jsx` capability map, per the repo
   convention — footer clauses are an operator power tool.

6. **Button styling follows the ⚙/⛶ siblings;** active state = accent color +
   count badge. i18n strings in `en.json` like the rest of the composer.

## Risks / Trade-offs

- [Repeated footer clutters every user bubble] → Accepted for v1: it is honest
  (what you see is what was sent) and consistent with the visible attachment
  suffix. If it grates, the follow-up is the loop-briefing pattern (marker +
  affordance instead of repeated text) keyed off the shared delimiter constant —
  deliberately left out of this change to keep it small.
- [Operator forgets clauses are on and wonders why the agent gets odd instructions]
  → The always-visible active state on the composer button (badge/highlight) plus
  the footer showing in the bubble make the amendment impossible to miss.
- [Clause text bloats every turn's tokens] → Clauses are short by nature and
  operator-curated; the checkbox makes turning them off trivial. No hard cap beyond
  the store's existing max-text guard.
- [Stale clause state at send time if another device edits] → The context refetches
  on popup open; a send between edits uses the last-loaded state. Worst case one
  turn carries a just-removed clause — harmless and self-correcting.

## Open Questions

- None blocking. Bubble-marker rendering (hide the repeated footer behind a chip)
  is noted as a possible follow-up change, not part of this one.
