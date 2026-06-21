# Tasks

## 1. Backend — PromptNotesService + API

- [ ] 1.1 Add `ClaudeWeb.App/Services/PromptNotes/PromptNotesService.cs` mirroring
      `PromptPlansService`: a `PromptNote { Id, Title, Body }` record, global store at
      `%APPDATA%\ClaudeWeb\prompt-notes.json`, atomic temp+rename `Save()`,
      never-reseed-on-unreadable `Load()`, and `List/Add/Update/Delete` with validation
      caps (title length, body length, max notes; drop fully-empty notes).
- [ ] 1.2 Add `ClaudeWeb.App/Services/PromptNotes/PromptNotesModuleExtensions.cs`
      (`AddPromptNotesModule()`), mirroring the Plans module.
- [ ] 1.3 Add `ClaudeWeb.App/Controllers/PromptNotesController.cs` exposing
      `/api/prompt-notes` GET / POST / PATCH {id} / DELETE {id} (global, no `X-Repo-Id`).
- [ ] 1.4 Register `builder.Services.AddPromptNotesModule();` in `EmbeddedApi.cs`.

## 2. Frontend — context + provider + panel

- [ ] 2.1 Add `client/src/context/PromptNotesContext.jsx` (fetch-once `usePromptNotes`
      with `addNote`/`updateNote`/`deleteNote`), mirroring `PromptPlansContext`.
- [ ] 2.2 Wrap the app in `PromptNotesProvider` in `Layout.jsx`, beside
      `PromptPlansProvider`.
- [ ] 2.3 Add `client/src/components/chat/PromptNotesPanel.jsx` — list + create/edit/
      delete a titled freeform note (sibling of `PromptPlansPanel.jsx`).
- [ ] 2.4 Add a third **Notes** tab to `PromptManager.jsx`'s Prompts | Plans switch and
      render `PromptNotesPanel`; thread notes + handlers from `ChatInput.jsx`.

## 3. i18n + gating

- [ ] 3.1 Add `notes.*` strings to `client/src/i18n/en.json` and `tr.json`.
- [ ] 3.2 Confirm the tab/pop-up stays behind the existing `customPrompts` Advanced gate
      (no new capability flag); verify it is hidden in Basic mode.

## 4. Verify

- [ ] 4.1 Backend: CRUD over HTTP against `/api/prompt-notes` (create, edit, delete,
      list) + persistence across restart.
- [ ] 4.2 Browser (isolated preview build): open ⚙ → Notes tab → create a note → edit →
      delete → persists across reload; Prompts and Plans tabs still work; 0 console errors.
- [ ] 4.3 Confirm `prompt-notes.json` is written and is separate from Ideas' `notes.json`.

## 5. Ship

- [ ] 5.1 Build, deploy to live `:5099` via `swap.ps1` (origin/main guard), browser-verify.
- [ ] 5.2 Update the Understanding app for the three-tab pop-up; `openspec archive
      add-prompt-notes-tab` to fold the delta into the `prompt-library` baseline.
