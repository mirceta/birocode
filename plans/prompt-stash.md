# Prompt stash — jot ideas mid-run

> **Status (2026-06-11):** Deployed to the live :5099 harness and confirmed by
> the End User. Browser-verified beforehand on the :5201 preview
> (`verify-prompt-stash.mjs`, 11/11 checks); stash round-trip re-verified on
> live after the bin swap.

## Why

Ideas for the next prompt arrive while the agent is still executing, and they
evaporate. The End User needs a one-tap way to store the thought before it's
gone — without leaving the Chat tab (a whole tab for this is overkill).

## Design

- **Typing during a run is now enabled.** The composer textarea used to be
  disabled while streaming; that's lifted (Send is still replaced by Stop, so
  nothing can be sent mid-run — only drafted or stashed). This is a deliberate
  behaviour change to the composer.
- **Stash button** (⚑) sits next to Send. Tap with a non-empty draft → the
  draft is stored and the input clears.
- **Chips** for stashed ideas render in a horizontally scrollable row above
  the composer. Tap a chip → its text loads into the composer and the chip is
  removed. The **×** on a chip deletes without loading.
- **Swap rule:** tapping a chip while the composer holds a draft stashes that
  draft first — no text is ever lost.
- **Backend-synced, per agent tab** (End User's explicit choice): items live
  on the dock tab in `dock.json` and ride the existing dock sync, so an idea
  stashed on the phone shows on the desktop. Closing an agent discards its
  stash with it.

API (extends plans/dock-sync.md):

| Endpoint | Action |
|----------|--------|
| `POST /api/dock/{id}/stash` | Add `{ text, id?, createdAt? }` (client id = optimistic UI; duplicate id returns existing). |
| `DELETE /api/dock/{id}/stash/{stashId}` | Remove one idea. |

`GET /api/dock` now includes `stash: [{ id, text, createdAt }]` per tab.
Text capped at 4000 chars server-side. Old `dock.json` entries without the
field load as an empty list.

## Scope

`promptStash: 'advanced'` in the capability map (new-features-default-Advanced
convention). The button and chips only render when an agent tab is active.

## What

- `ClaudeWeb.App/Services/Dock/DockRegistry.cs` — `StashItem`, `DockTab.Stash`,
  `AddStash`/`RemoveStash`, deep clone, load guard.
- `ClaudeWeb.App/Controllers/DockController.cs` — stash endpoints + DTO.
- `client/src/context/DockContext.jsx` — optimistic `addStash`/`removeStash`.
- `client/src/components/chat/ChatInput.jsx` — typing-while-streaming, stash
  button, chips row, swap rule.
- `client/src/components/chat/chat.css`, i18n en/tr, capability map.

## Verification

`.claudeweb-preview/playwright/verify-prompt-stash.mjs` on :5201 (own dock
tab, logs in, cleans up): stash from composer, backend round-trip, reload
persistence, chip tap restores + removes, swap rule, × delete, hidden in
Basic mode.
