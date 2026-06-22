# Add prompt templates — parameterized custom prompts filled via a form

## Why

The chat composer's saved-prompts pop-up (the ⚙ modal, `customPrompts` Advanced gate) has a
custom-prompt store that is **dormant**: the backend still carries full CRUD
(`PromptsService.cs` → `%APPDATA%\ClaudeWeb\prompts.json`, `PromptsController.cs`,
`PromptsContext.jsx`), but the UI was reduced to a **fixed, insert-only built-in set** and the
`prompts` baseline spec explicitly **retired** the editable custom list. So today a custom
prompt can only be inserted whole, verbatim.

That misses the real need: the genuinely useful prompts are **long and mostly boilerplate**,
where only a few spots change each time (a ticket id, a file path, a target, a tone). Pasting
the whole thing and then hunting through it to edit those spots is exactly the friction the
pop-up was meant to remove. The operator wants to keep the long template once and, at use
time, **fill in just the holes on a form** — see the parameters laid out, type the values, and
get the finished prompt dropped into the composer.

This change **un-retires** the custom-prompt list and upgrades it into **prompt templates**: a
stored template carries named placeholders, and "Use" opens a small form to fill them before
the substituted text lands in the draft.

## What Changes

- **Reinstate the editable custom-prompt list** as the home for templates — reversing the
  `prompts` baseline's "custom list retired" decision (built-ins stay fixed and insert-only;
  the custom list returns, now template-shaped). This is a `MODIFIED` requirement, not a new
  capability.
- **Template placeholder syntax** — a custom prompt's body may contain named placeholders
  (e.g. `{{ticket}}`, `{{target_file}}`); the set of distinct placeholder names defines the
  template's parameters. Bodies with no placeholders behave exactly as today (insert verbatim).
- **Parameter-fill form** — choosing "Use" on a template with parameters opens a form (one
  labelled field per distinct placeholder) layered over the pop-up; on confirm, every
  occurrence is substituted and the result is inserted into the composer via the existing
  `insertPrompt()` path. A template with no parameters skips the form and inserts directly.
- **Create / edit a template** — the add/edit form for custom prompts (emoji, label, body)
  returns to the pop-up, with a live preview of the detected parameters so the author sees
  which holes will be asked for.
- **Understanding app** — `understanding-app/index.html` overwritten with a companion
  visual of the template → parameter-form → substituted-insert flow.

## Impact

- **Affected specs:** `prompts` — `MODIFIED` (un-retire the editable custom list) plus
  `ADDED` requirements for template parameters, the fill-form, and direct-insert fallback.
- **Affected code (frontend):** `client/src/components/chat/PromptManager.jsx` (parameter-fill
  form + reinstated add/edit form, parameter detection/preview),
  `client/src/components/chat/ChatInput.jsx` (route "Use" through the form when a template has
  parameters, before `insertPrompt`), `client/src/context/PromptsContext.jsx` (CRUD already
  present — reused).
- **Affected code (backend):** `ClaudeWeb.App/Services/Prompts/PromptsService.cs` +
  `Controllers/PromptsController.cs` — likely **no schema change**: placeholders live inside
  the existing `Text` field by convention, so the `Prompt(Id, Emoji, Label, Text)` record and
  `prompts.json` store are unchanged (confirmed/decided in `design.md`).
- **Gate:** inherits the existing `customPrompts: 'advanced'` capability gate
  (`client/src/context/UiModeContext.jsx`) — Basic mode is unaffected.
- **Out of scope:** no new parameter *types* (every parameter is a free-text field — no
  dropdowns/dates/validation); no sharing/scoping changes (the list stays global, not
  per-repo); the Plans and Notes tabs are untouched.
