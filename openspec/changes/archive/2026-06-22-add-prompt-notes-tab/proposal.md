# Add a Notes tab to the prompt pop-up

## Why

The chat composer's ⚙ saved-prompts pop-up already has two tabs — **Prompts**
(one-off reusable snippets) and **Plans** (named, ordered prompt-step sequences).
But real planning starts messier than a finished plan: the user jots **freeform
working notes** first — half-formed ideas for what to ask the agent next — and only
later shapes them into a structured prompt plan. Today there is nowhere in the pop-up
to keep those drafts, so they live outside the tool (or not at all) and the
note → plan workflow has a missing first step.

## What Changes

- Add a **third tab — "Notes"** — to the prompt pop-up (`PromptManager`), alongside
  Prompts and Plans. It does **not** replace either.
- A **note** is a titled, freeform block of text the user is drafting that has **not
  yet been ported into a prompt plan** but is intended to be.
- Support **create / edit / delete / list** of notes in the pop-up.
- Persist notes **globally, backend-synced**, exactly like Prompts and Plans: a new
  `PromptNotesService` + `/api/prompt-notes` CRUD + `prompt-notes.json`, mirroring
  `PromptsService` / `PromptPlansService` (atomic temp+rename writes,
  never-reseed-on-unreadable load guard, validation caps).
- Reuse the existing **`customPrompts` Advanced-mode gate** so the ⚙ (and the new
  tab) appear only in Advanced mode.
- **i18n** strings for English and Turkish.

## Impact

- **Affected specs:** `prompt-library` (new capability spec, seeded by this change's
  delta — the ⚙ pop-up: Prompts, Plans, and now Notes).
- **Affected code (new):** `ClaudeWeb.App/Services/PromptNotes/` (service + DI module),
  `ClaudeWeb.App/Controllers/PromptNotesController.cs`,
  `client/src/context/PromptNotesContext.jsx`,
  `client/src/components/chat/PromptNotesPanel.jsx`.
- **Affected code (edited):** `PromptManager.jsx` (third tab),
  `Layout.jsx` (provider), `EmbeddedApi.cs` (DI registration),
  `client/src/i18n/en.json` + `tr.json`.
- **Distinct from** the existing `NotesService` (backs the **Ideas** tab via
  `notes.json`) — separate backend and store (`prompt-notes.json`) to avoid collision.
- **Out of scope (deferred):** a "convert this note into a plan" affordance that
  seeds a new prompt plan from a note. Captured as a non-goal for a later change.
