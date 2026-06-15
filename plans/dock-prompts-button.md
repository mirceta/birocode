# Custom-prompts button on the dashboard docks

> **Status (2026-06-15):** **Built, browser-verified & merged to main.** On
> `feature/dock-prompts-button`. The custom-prompts ⚙ button
> (plans/custom-prompts.md) is now available in the dashboard agent docks, not
> just the main chat composer. Verified on an isolated :5210 instance
> (`.preview-test/dock-prompts-check.mjs`, ALL PASS).

## Problem

The custom-prompts ⚙ button + `PromptManager` modal are gated by
`customPromptsEnabled && !embedded` in `ChatInput.jsx`, so they don't appear in
the dashboard docks' embedded composer. The user wants to drop a prompt into a
dock's chat without maximizing it.

## Design (frontend only)

- Remove the `!embedded` condition from both the ⚙ button render and the
  `PromptManager` render in `ChatInput.jsx`.
- Safe because `PromptManager` portals to `document.body` (centered modal,
  unaffected by the dock window or content-zoom), prompts are global
  (`PromptsContext`), and "Use" inserts into that dock's own composer.
- The prompt **stash** (⚑) stays dock-disabled (tab-scoped, would cross-write) —
  unchanged.

## Verification

- Browser-verify (per `docs/claude-web/browser-testing.md`) on an isolated
  instance: the ⚙ shows on a dock composer; clicking opens the prompts modal;
  "Use" prefills that dock's composer; modal renders centered/normal size.
