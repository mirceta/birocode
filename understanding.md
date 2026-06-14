# Understanding — render HTML files in the Files viewer

## Goal
Right now the Files viewer only *renders* Markdown; HTML files show as raw
source. Make `.html`/`.htm` files **render as a page** in the viewer, with a
raw/rendered toggle (same affordance Markdown already has).

## How (safely)
- Detect HTML by extension; treat it as "renderable" alongside Markdown.
- Rendered view = a **sandboxed `<iframe srcDoc={content} sandbox="">`** — no
  scripts, no same-origin, no forms/popups. File content is untrusted, so it
  must never run in the harness's authenticated origin; the empty sandbox
  renders static HTML + inline CSS and neutralizes everything dangerous.
- Raw view = the existing `<pre>` source. Default to rendered (like Markdown).

## Known limits (slice 1)
- **Scripts don't run** (sandbox) — JS-driven pages render as their static
  shell. That's the safety trade, on purpose.
- **Relative assets** (external CSS/images/`<script src>`) won't load — `srcDoc`
  has no base URL. Self-contained / inline-styled HTML renders fine. A future
  slice could add a `<base>` or proxy if needed.

## Judgment call to flag
Markdown rendering is **not** gated by UI mode, so for consistency I'm leaving
HTML rendering ungated too (visible in Basic + Advanced) — a deviation from the
"new UI features default to Advanced" convention. Say the word to gate it.

## Plan
`plans/html-preview.md`, branch `feature/html-preview`. Frontend-only
(`FileViewer.jsx` + `files.css`). Verify a sandboxed HTML file renders, the
toggle flips to raw source, and scripts are inert.
