# HTML preview — render .html files in the Files viewer

> **Status (2026-06-14):** SHIPPED — live on :5099 (frontend-only; built into
> client/dist) and confirmed working, merged to main. Browser-verified
> (verify-html-preview.mjs 6/6). Realizes the deferred "HTML webview" slice of
> [doc-viewer](doc-viewer.md), scoped to a safe sandboxed render.

## Try it

Open **[html-preview-demo.html](html-preview-demo.html)** — a self-contained
page that renders its own styling and proves the script sandbox holds (a line
stays red because its `<script>` can't run). Tap **Raw** to see the source.

## Problem

The Files viewer renders **Markdown** but shows every other file — including
`.html` — as raw source (`FileViewer.jsx`: `showRendered = isMarkdown && !raw`).
So an HTML file in the tree can't be previewed as a page, only read as text.

## Goal

`.html` / `.htm` (and `.xhtml`) files **render as a page** in the viewer, with
the same raw/rendered toggle Markdown has (default rendered).

## Design

- `HTML_RE = /\.(html?|xhtml)$/i`; `canRender = isMarkdown || isHtml`;
  `showRendered = canRender && !raw`. The raw toggle shows whenever `canRender`.
- Rendered HTML = a **sandboxed iframe**:
  `<iframe srcDoc={content} sandbox="" class="file-viewer__html">`.
  - `sandbox=""` (empty = maximum restriction) blocks scripts, same-origin,
    forms, popups, and top-navigation. File content is **untrusted**, so it must
    never execute in the harness's authenticated origin — this neutralizes it
    while still rendering static HTML + inline CSS.
  - `srcDoc` (not `src`) so we never expose a fetchable URL or a real origin.
- Raw view unchanged (`<pre>`). Markdown still renders via `<Markdown>`; only the
  "else" branch for HTML changes.

## Security

The whole point. `sandbox=""` with no `allow-scripts`/`allow-same-origin` means
embedded JS can't run and can't reach cookies, the session, or the DOM of the
harness. No `allow-top-navigation`, so it can't redirect the tab. This is why we
render via iframe, never by injecting HTML into the page.

## Known limits (slice 1)

- Scripts are inert (sandbox) — JS-driven pages show their static shell only.
- Relative assets (external CSS/JS/images) don't resolve — `srcDoc` has no base
  URL. Inline/self-contained HTML renders fully. A `<base>`/proxy is a possible
  future slice.

## Decisions

- **Ungated** (Basic + Advanced), matching Markdown rendering — a flagged
  deviation from "new UI defaults to Advanced." Easy to gate later.
- Default **rendered** (like Markdown); toggle to raw source.

## Implementation

- `FileViewer.jsx`: add `isHtml`/`canRender`; render the sandboxed iframe in the
  HTML branch; show the raw toggle for `canRender`.
- `files.css`: `.file-viewer__html` (full-height, white background, no border).

## Verification

Isolated/`:5099` + Playwright `verify-html-preview.mjs`: open a self-contained
`.html` file → it renders in a `sandbox`'d iframe whose `srcdoc` matches the
file and whose body shows the expected text; the toggle flips to raw `<pre>`
source; assert the iframe carries an empty `sandbox` attr (scripts inert). Read
a screenshot.
