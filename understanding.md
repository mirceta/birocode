# Understanding — user-defined custom prompts

## What you asked for
Right now the composer has two **hardcoded** prefill buttons (understanding 📝,
kick-off 🚀). You want to **add your own pre-prepared prompts on the fly** — a UI
to create/manage personal prompt presets, each of which then shows up as the same
kind of one-tap button that fills the chat box.

## Approach (built)
- **Each preset = an emoji + a label + a prompt body**, saved to a **global,
  backend-synced** list (`prompts.json`), so they follow you across devices and
  projects.
- **Backend:** a `PromptsService` + `/api/prompts` CRUD (the Notes/Pins pattern,
  but global — not per-repo).
- **In the composer:** saved presets render as buttons next to 📝/🚀; clicking
  prefills the composer (append, no auto-send) — the exact mechanism the kickoff
  button uses.
- **Manager UI:** a `+` button by the composer opens a popover with the list +
  an add/edit/delete form (emoji picker + label + text).
- Built-in 📝/🚀 stay; your custom ones appear alongside. Advanced-gated.

## Status
Built & browser-verified (`verify-custom-prompts.mjs`, 7/7 on isolated :5201:
add → composer button → prefill; edit + delete persist across reload). Committed
on `feature/custom-prompts` (586ea03). Pending deploy/merge.
