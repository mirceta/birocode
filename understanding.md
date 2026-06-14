# Understanding — user-defined custom prompts

## What you asked for
Right now the composer has two **hardcoded** prefill buttons (understanding 📝,
kick-off 🚀). You want to **add your own pre-prepared prompts on the fly** — a UI
to create/manage personal prompt presets, each of which then shows up as the same
kind of one-tap button that fills the chat box.

## Approach (built — unified single-entry design)
- **One ⚙ button** by the composer opens a **centered modal** (portaled to
  `<body>` so the composer's `transform` stacking context can't hide it). The
  old per-feature toolbar buttons (📝 understanding, 🚀 kickoff) and per-preset
  buttons are gone — everything lives in the modal.
- **The modal lists every prompt** — the two built-ins (understanding, kickoff,
  text from i18n, insert-only) on top, then the user's custom ones — each with a
  **Use** button that inserts it into the composer (append, no auto-send) and
  closes the modal. Custom ones also have Edit/Delete.
- **Add your own** via the emoji-picker + label + text form at the bottom.
- **Backend:** global `PromptsService` + `/api/prompts` CRUD (Notes/Pins
  pattern, but global — not per-repo); custom prompts persist in `prompts.json`.
- Advanced-gated.

## Status
Built & browser-verified on live :5099 (`verify-unified.mjs` 9/9: toolbar has
only ⚙; modal lists built-ins with Use; Use prefills the composer + closes;
no errors). Deployed (backend `369e88b`, frontend live). Pending "keep it".
