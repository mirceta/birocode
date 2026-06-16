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

- **A. CLAUDE.md convention only.** Document the reflex as a prompt convention;
  the agent writes a mermaid/HTML diagram and we lean on the existing doc viewer to
  show it. No harness code.
- **B. Standing nudge → doc viewer.** The harness appends a short instruction to
  *every* agent prompt ("if you're explaining something non-trivial, write a
  mermaid/HTML diagram to `<path>`"); the existing doc/Files viewer renders it.
- **C. Standing nudge → dedicated diagram panel.** Same nudge, plus a new
  first-class panel that live-polls the known diagram file (the
  [Understanding panel](understanding-panel.md) pattern) so the picture shows
  itself without the user navigating to it.
- **D. Standing nudge → served diagram product on the Local tab.** Same nudge, but
  the agent writes the diagram to a tiny always-on local server (the `serve.mjs`
  pattern from [local-exposure-example](local-exposure-example.md)), shown on the
  Local tab via `/api/localview`. Closest to the user's "through our local app"
  framing.
- **E. Diagram tool (tool-call / MCP).** Give the agent an explicit
  `render_diagram` tool the harness handles, instead of a prose nudge — structured
  and hard to "forget," but the most plumbing.

### Comparison

Ratings are Low / Med / High. For **Dev effort** and **Dev risk**, lower is
better; for the rest, higher is better.

| Approach | Dev effort | Dev risk | "Every-prompt" reliability | Reuses existing | Diagram fidelity | Fits "via Local app" | Harness change |
|---|---|---|---|---|---|---|---|
| **A. Convention only** | Very low | Very low | Low ¹ | High | Med | Partial | None |
| **B. Nudge → doc viewer** | Low–Med | Med ² | High | High | Med | Partial | Prompt-build |
| **C. Nudge → diagram panel** | Med | Med | High | Med | Med–High | Good | Prompt-build + new panel |
| **D. Nudge → served product** | Med–High | Med–High ³ | High | Med | High | Best | Prompt-build + server lifecycle |
| **E. Diagram tool** | High | High | High & robust ⁴ | Low | High | Depends | Significant |

¹ Per-repo and prose-only — not literally every prompt; agents can skip it.
² Touches prompt construction (harness core) — small edit but a central path.
³ A per-repo always-on server + port lifecycle is more moving parts to manage.
⁴ A structured tool call resists being "forgotten" better than a prose nudge, but
needs new tool plumbing.

Other axis worth noting: **cross-repo reach.** A (CLAUDE.md) is per-repo only;
B–E inject at prompt-build time, so they work for *every* repo the harness drives.

### How to read it / lean

- If the priority is **cheap + robust nudge**, **B** wins — one prompt-build edit,
  render for free.
- If the priority is **literally "through our local app"** and rich visuals
  (animation like the four-variant explainer), **D** fits best, at higher cost.
- **C** is the middle: a dedicated, self-revealing surface without standing up a
  per-repo server.
- **A** is a fine *first step* (zero risk) that can later graduate to B/C/D.
- **E** is the most durable delivery but the heaviest; park unless prose nudges
  prove unreliable.

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
