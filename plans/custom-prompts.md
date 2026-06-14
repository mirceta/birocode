# Custom prompts — user-defined composer prefill buttons

> **Status (2026-06-14):** BUILT, DEPLOYED to live :5099, browser-verified.
> **Redesigned after first feedback into a single-entry UI:** one ⚙ button opens
> a centered modal (portaled to `<body>` — the composer's `transform` stacking
> context was hiding the original popover, "the button does nothing"). The modal
> holds BOTH the former toolbar buttons (📝 understanding, 🚀 kickoff, now
> insert-only built-ins) AND the user's custom prompts, each with a **Use** button
> that prefills the composer; custom ones add Edit/Delete; an add form at the
> bottom. The 📝/🚀/per-preset toolbar buttons were removed. Verified live with
> `verify-unified.mjs` (9/9) + `verify-modal.mjs` (phone+desktop). On
> `feature/custom-prompts` (merged with origin/main), pending "keep it". Supersedes
> the [feature-kickoff](feature-kickoff.md) per-button approach.

## Problem

We now have two **hardcoded** composer-prefill buttons — understanding (📝) and
kick-off (🚀) — each drops a canned prompt into the chat box. The user wants to
**add their own pre-prepared prompts on the fly**: a UI to create/manage personal
prompt presets that then appear as the same kind of one-tap prefill buttons.

## Goal

A small UI to **add / edit / delete custom prompts**, and have each saved prompt
show up as a composer button that prefills the chat box (same mechanism as the
built-in ones). Personal, reusable, no retyping.

## Proposed design (sensible defaults — confirm at playback)

- **Data model:** a preset = `{ id, label, text }` (label = short button caption;
  text = the prompt body). Emoji/icon optional later.
- **Storage:** **global + backend-synced** — `prompts.json` in
  `%APPDATA%\ClaudeWeb` (one list, NOT per-repo; canned prompts are cross-project).
  New `PromptsService` (atomic write + never-reseed guard, the Notes/Pins pattern)
  + `PromptsController` CRUD: `GET/POST/PATCH/DELETE /api/prompts`. Global, so no
  `X-Repo-Id` scoping.
- **Composer display:** saved presets render as buttons/chips in the composer
  toolbar, next to the built-in 📝/🚀. Click → prefill the composer (append, no
  auto-send, focus) — reuse the existing `handle*Prefill` mechanism.
- **Manager UI:** a lightweight add/edit/delete surface — default: a "manage
  prompts" affordance by the composer presets (e.g. a `+`/⚙ button) opening a
  small popover/modal with the list + an add form (label + text).
- **Built-ins:** keep 📝/🚀 hardcoded; user presets appear alongside. (Alt:
  seed them as editable presets — decide at build.)
- **Gating:** Advanced (new-UI convention), like the kickoff button.

## Decisions (locked)

1. **Global** storage (not per-project).
2. **Composer popover** for the manage UI (opened from a `+` by the composer).
3. **Built-ins (📝/🚀) stay hardcoded**; custom presets render alongside.
4. **Per-preset emoji** — the add/edit form has an emoji **picker with lots of
   choices**; the chosen emoji is the preset's button caption.
5. **No cap** on the number of presets. (Still length-cap the text for sanity.)

## Implementation sketch

- Backend: `Services/Prompts/` (`PromptsService`, `PromptsModuleExtensions`),
  `PromptsController`, wire `AddPromptsModule` in `EmbeddedApi`.
- Frontend: a `usePrompts` fetch/CRUD hook or small context; render preset
  buttons in `ChatInput`; a manager popover/modal; i18n (en/tr); CSS.

## Verification (planned)

Isolated `:5201` + Playwright: add a preset via the UI → it appears as a composer
button → clicking prefills the composer; edit + delete persist across reload
(backend-synced); advanced-gated. Read a screenshot. Hygiene: `prompts.json` is
shared with live — clean up test presets.
