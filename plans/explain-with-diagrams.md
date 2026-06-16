# Explain with diagrams — serve a picture whenever the agent explains

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): DESIGN — not building yet.** On
> `feature/explain-with-diagrams`. Approach not chosen; this captures the goal and
> the candidate designs so we can pick before writing code.

## The problem

Agents explain a lot in prose — architecture, request flows, trade-offs, "here's
what I'm about to do." Walls of text are easy to skim past and hard to hold in
your head. We just shipped the [local-exposure-example](local-exposure-example.md),
which proves a picture served on the Local tab reads far better than paragraphs.
We want that by default: **when the agent explains something, it should serve a
diagram of it on the Local app**, with the nudge attached to (effectively) every
prompt so it becomes the agent's default reflex.

## What we already have to build on

- **Serving:** any product on a loopback port reaches the Local tab via the
  authenticated `/api/localview/<repo>/` proxy
  ([Local tab over the internet](local-app-proxy.md)).
- **Diagram rendering:** the doc viewer renders **mermaid**, Markdown, and HTML
  ([Docs viewer](mermaid-diagrams.md), HTML preview).
- **"Agent writes a file → harness renders it":** the
  [Understanding panel](understanding-panel.md) is the precedent.

## Candidate approaches (to choose from)

1. **Standing nudge + reuse the doc/diagram renderer.** The harness appends a
   short standing instruction to every agent prompt ("if you're explaining
   something non-trivial, write a mermaid/HTML diagram to `<path>`"), and the
   harness auto-renders that file in a dedicated panel (Understanding-panel style).
   *Lightest; touches prompt-building + a small render surface.*
2. **Standing nudge + a served diagram product.** The agent writes the diagram to
   a tiny always-on local server (the `serve.mjs` pattern from
   [local-exposure-example](local-exposure-example.md)) shown on the Local tab.
   *Closest to the user's "through our local app" framing; reuses the proxy.*
3. **CLAUDE.md convention only (no harness change).** Document the reflex as a
   prompt convention. *Cheapest, but "every prompt" is weaker and per-repo.*

## Open questions

- **Instruction delivery:** harness-appended system-reminder at prompt-build time,
  vs. a CLAUDE.md convention, vs. a user toggle. (Prompt-building is a harness
  change — plan it deliberately.)
- **Trigger threshold:** only non-trivial explanations — agent's judgment vs. an
  explicit cue — so we don't diagram one-line answers.
- **Lifecycle:** one rolling "latest diagram" vs. a small history; how it clears.
- **Format:** mermaid (leans on the existing renderer) vs. hand-authored
  HTML/SVG (richer, like the four-variant explainer).

## Out of scope (for now)

- Auto-generating diagrams *for* the agent. The agent authors the diagram; the
  harness only serves/renders it.

## Next step

Pick an approach (likely #1 or #2) and slice it. Until then, no code.
