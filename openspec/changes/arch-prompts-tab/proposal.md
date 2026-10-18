# The arch's cached prompts get their own Management tab (fleet task f6add917)

## Why

The Operator (2026-10-18) found the arch agent's cached prompts (openspec arch-custom-prompts) badly laid out:

- They sat as a large block **above the Arch chat composer**: four-column cards with a search bar, a "New prompt"
  button and "Re-seed".
- The block took the lower half of the conversation and pushed the composer below the fold.
- It mixed managing a library with typing a message.

## What changes

- **A "Prompts" tab** in the Management dashboard holds the full library.
  - **Layout:** grouped by category, searchable, filterable by origin (seeded / edited / custom).
  - **Each card shows** the template with its placeholders as chips, its hint, where it came from (the Arch
    examples category), the tools it leads to (from the Arch examples catalogue), and how often and when it was
    used.
  - **Actions:** add, edit, duplicate, move earlier / later, delete, and re-seed from the Arch examples (only
    missing categories are added, so Operator edits survive — unchanged).
- **"Use"** opens a fill-in sheet on the card. Machine, agent, branch and card placeholders pick from the live
  arch state and the task graph; the rest is free text. A live preview shows the result. Two exits:
  - **▶ Send to the arch** sends it to the Operator-facing conversation.
  - **Open in Arch chat** switches to the Arch tab with the prompt in the composer. There, any unfilled
    placeholders become the composer's chips.
- **The Arch chat keeps one affordance.** A **📋 Prompts** button in the composer row opens a compact
  searchable picker, most used first; a click inserts the prompt. A link leads to the Prompts tab. The big
  in-chat panel is gone; the placeholder chips stay.
- **Usage is counted.** The prompt record gains `uses` / `lastUsedAt`, and `POST /api/prompts/{id}/used` is
  called by Use, Send and the picker. Same store, same endpoints, same seeding rule. The arch's
  `cache_prompt` / `list_cached_prompts` / `remove_cached_prompt` behave as before.

## Impact

- **Client:**
  - new `manage/PromptsTab.jsx` + `promptsTab.css`;
  - new `components/arch/ArchPromptPicker.jsx`, `PromptForm.jsx` (extracted), `archHandoff.js` (+ test);
  - `archPrompts.js` gains segments / usage helpers (+ tests);
  - `ArchPromptsPanel.jsx` is removed;
  - `Arch.jsx` and `ManageApp.jsx` (the tab, plus an open-tab event).
- **Server:** `PromptsService.Prompt` gains `Uses` / `LastUsedAt`, `MarkUsed`, and the `/used` endpoint (+ test).
  Old files load unchanged.
- **Subagents:** goal conversations render the same Arch component, so they get the same 📋 Prompts button.
  Queueing an Operator message for a held goal works as before.
- **Independent of the unmerged Memory tab (#178).** This branch is based on main.
