# Understanding — user-defined custom prompts

## What you asked for
Right now the composer has two **hardcoded** prefill buttons (understanding 📝,
kick-off 🚀). You want to **add your own pre-prepared prompts on the fly** — a UI
to create/manage personal prompt presets, each of which then shows up as the same
kind of one-tap button that fills the chat box.

## Proposed approach (defaults — tell me to adjust)
- **Each preset = a label + a prompt body**, saved to a **global, backend-synced**
  list (`prompts.json`), so they follow you across devices and projects.
- **Backend:** a `PromptsService` + `/api/prompts` CRUD (the Notes/Pins pattern,
  but global — not per-repo).
- **In the composer:** saved presets render as buttons next to 📝/🚀; clicking
  prefills the composer (append, no auto-send) — the exact mechanism the kickoff
  button uses.
- **Manager UI:** a small add/edit/delete surface (default: a `+`/⚙ button by the
  composer that opens a popover with the list + an add form).
- Built-in 📝/🚀 stay; your custom ones appear alongside. Advanced-gated.

## Status
Branch `feature/custom-prompts` created off synced main; plan +
`plans/custom-prompts.md` entry written. **Not built yet** — playing this back
first. Open questions in the plan: storage scope (global vs per-project),
manager UI shape, whether the built-ins become editable presets, per-preset
icons, and limits.
