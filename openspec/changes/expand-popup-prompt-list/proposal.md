# Proposal: expand-popup-prompt-list

## Why

The composer's expand popup (openspec add-prompt-expand-popup) is where long prompts get
written — especially inside a dashboard dock, where the inline textarea is a sliver. But the
user's saved prompt library lives only behind the separate ⚙ manager modal: while drafting in
the big editor you cannot see or reuse a saved prompt without closing the editor, opening the
manager, inserting, and re-expanding. And a prompt worth saving that was just drafted in the
big editor has no save path at all from there.

## What Changes

- The expand popup lists the user's saved custom prompts (the backend-synced `/api/prompts`
  store — the same list the ⚙ manager's "New ideas" section edits) below the draft editor.
  Each entry shows its emoji/label/text and an Insert action that APPENDS the prompt text to
  the draft (blank-line separated, same contract as the manager's Use). Nothing auto-sends;
  the popup stays open so drafting continues.
- The popup gains a minimal create form (optional label + required text) that saves a new
  custom prompt into the same global store — it immediately appears in this list, the ⚙
  manager, and every other composer.
- Scope cuts (deliberate): the 17-prompt fixed catalog stays ⚙-only (it would flood the
  popup); template prompts (`{{param}}`) insert verbatim here — the popup IS an editor, the
  placeholders are edited in place; edit/delete of saved prompts stays in the ⚙ manager.
- The saved-prompts section is gated on the existing `customPrompts` capability, on top of
  the popup's own `promptExpand` gate. No backend change — the existing prompts API carries
  everything.

## Impact

- Capabilities: `chat` (MODIFIED: expand-popup requirement grows the saved-prompts section)
- Code: `client/src/components/chat/PromptExpandModal.jsx` (list + create form),
  `client/src/components/chat/ChatInput.jsx` (pass prompts + add through),
  `client/src/components/chat/chat.css`, `client/src/i18n/en.json`, `client/src/i18n/tr.json`
