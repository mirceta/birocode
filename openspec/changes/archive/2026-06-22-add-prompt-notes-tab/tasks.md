# Tasks

## 1. Backend — PromptNotesService + API

- [x] 1.1 Add `ClaudeWeb.App/Services/PromptNotes/PromptNotesService.cs` mirroring
      `PromptPlansService`: a `PromptNote { Id, Title, Body }` record, global store at
      `%APPDATA%\ClaudeWeb\prompt-notes.json`, atomic temp+rename `Save()`,
      never-reseed-on-unreadable `Load()`, and `List/Add/Update/Delete` with validation
      caps (title length, body length, max notes; drop fully-empty notes).
- [x] 1.2 Add `ClaudeWeb.App/Services/PromptNotes/PromptNotesModuleExtensions.cs`
      (`AddPromptNotesModule()`), mirroring the Plans module.
- [x] 1.3 Add `ClaudeWeb.App/Controllers/PromptNotesController.cs` exposing
      `/api/prompt-notes` GET / POST / PATCH {id} / DELETE {id} (global, no `X-Repo-Id`).
- [x] 1.4 Register `builder.Services.AddPromptNotesModule();` in `EmbeddedApi.cs`.

## 2. Frontend — context + provider + panel

- [x] 2.1 Add `client/src/context/PromptNotesContext.jsx` (fetch-once `usePromptNotes`
      with `addNote`/`updateNote`/`deleteNote`), mirroring `PromptPlansContext`.
- [x] 2.2 Wrap the app in `PromptNotesProvider` in `Layout.jsx`, beside
      `PromptPlansProvider`.
- [x] 2.3 Add `client/src/components/chat/PromptNotesPanel.jsx` — list + create/edit/
      delete a titled freeform note (sibling of `PromptPlansPanel.jsx`).
- [x] 2.4 Add a third **Notes** tab to `PromptManager.jsx`'s Prompts | Plans switch and
      render `PromptNotesPanel`; thread notes + handlers from `ChatInput.jsx`.

## 3. i18n + gating

- [x] 3.1 Add `notes.*` strings to `client/src/i18n/en.json` and `tr.json`.
- [x] 3.2 Confirm the tab/pop-up stays behind the existing `customPrompts` Advanced gate
      (no new capability flag) — Notes is a tab inside the already-gated ⚙ modal, so it
      inherits the gate with no code change; hidden in Basic mode.

> **Redesign mid-flight:** after the list-of-titled-notes version shipped, the Notes
> tab was reworked into a SINGLE resizable autosaving canvas (one `{ text }` document;
> controller `GET` + `PUT /api/prompt-notes`; `PromptNotesService` stores one string).
> Tasks 1.x/2.x above describe the original list model; the delta spec and code reflect
> the canvas model that actually shipped.

## 4. Verify

- [x] 4.1 Backend: `GET`/`PUT /api/prompt-notes` over HTTP + persistence across restart
      (atomic store, never-reseed-on-unreadable).
- [x] 4.2 Browser: open ⚙ → Notes tab → type → autosave + Save → persists across reload;
      resize works; Prompts and Plans tabs still work. **User-confirmed working on live.**
- [x] 4.3 Confirm `prompt-notes.json` is written and is separate from Ideas' `notes.json`.

## 5. Ship

- [x] 5.1 Build, deploy to live `:5099` via `swap.ps1` (origin/main guard), browser-verify.
- [x] 5.2 `openspec archive add-prompt-notes-tab` — fold the delta into the new
      `prompt-library` baseline; merge `feature/prompt-notes` into `main`.
