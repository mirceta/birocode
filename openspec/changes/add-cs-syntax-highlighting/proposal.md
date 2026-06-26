# C# syntax highlighting + IDE line numbers in the Files viewer

## My understanding of the request (restated for confirmation)

**Goal.** In the **Files tab**, when you open a **`.cs`** file, render it with **C#
syntax highlighting** (keywords, strings, comments, types colored), and show
**line numbers in a left gutter** the way an IDE does.

**Where this lives in the code (what I found):**

- The viewer renders non-markdown/non-image files as raw text at
  `client/src/components/files/FileViewer.jsx:114`:
  `<pre className="file-viewer__code">{content}</pre>` — `content` is the file
  string from `GET /api/files/read?path=…`. There is **no** syntax highlighting
  anywhere today, and **no** line-number gutter.
- The viewer already branches on extension via regex (`MARKDOWN_RE`, `HTML_RE` at
  `FileViewer.jsx:5–6`); `.cs` falls through to the plain `<pre>`.
- Styles live in `client/src/components/files/files.css` (`.file-viewer__code` at
  ~`:351`, currently `white-space: pre-wrap`). The app is a **light** theme
  (`global.css`: `--color-surface:#fff`, `--color-text:#2b2b29`).
- No highlighter is installed (`client/package.json` has `react-markdown`,
  `mermaid`, etc. — the client is a normal Vite app, so an npm dep is fine).
- Feature gating is the `FEATURES` map in `client/src/context/UiModeContext.jsx`
  (e.g. `filesIdeMode`, `docLinks`).

## Concrete steps I'll take (after you confirm)

1. **Add a lightweight highlighter.** Install **`highlight.js`** and import only the
   **core + the `csharp` language** (`highlight.js/lib/core` + `.../languages/csharp`)
   so the bundle grows by a few KB, not the full ~1 MB pack.
2. **Highlight `.cs` in the viewer.** In `FileViewer.jsx`, add a `CS_RE = /\.cs$/i`
   branch: tokenize `content` with hljs and render the colored HTML inside
   `<code className="hljs language-csharp">` (set via the sanitized hljs output).
3. **Line-number gutter.** Render a two-column code block: a non-selectable gutter
   of line numbers + the code, aligned 1:1. To keep numbers aligned to lines I'll
   switch the code view to **non-wrapping** (`white-space: pre`) with horizontal
   scroll — the IDE behavior.
4. **Light token palette.** Add token colors in `files.css` tuned to the warm light
   theme (readable on `--color-surface`), instead of importing a dark hljs theme.
5. **Feature flag.** Add `codeHighlight: 'advanced'` to `FEATURES`; gate the
   highlighted/gutter rendering behind `useFeature('codeHighlight')`, falling back
   to today's plain `<pre>` when off.
6. **Verify** in a headless browser (per `docs/claude-web/browser-testing.md`):
   open a `.cs` file → tokens colored, gutter numbers match line count, long lines
   scroll horizontally without breaking number alignment; a non-`.cs` text file is
   unaffected (or shows numbers only — see A2).
7. **Understanding app** if the line-up (highlight pipeline + gutter alignment) is
   worth a visual; otherwise keep it prose (this is a fairly contained viewer change).

## Open questions / assumptions (please confirm or correct)

- **A1 — Library = `highlight.js` (core + csharp only).** Robust C# grammar, tiny
  when scoped to one language. *(Alternatives: Prism, Shiki — Shiki is heavier;
  Prism is fine too. I recommend hljs.)*
- **A2 — Line numbers scope.** I'll show the gutter for the **code view** generally
  (any plain-text/code file), since IDE line numbers aren't C#-specific — while
  **coloring** is C#-only for now (extensible to more languages later). Tell me if
  you want line numbers limited to `.cs`.
- **A3 — Non-wrapping code.** IDE-style line numbers require lines not to wrap, so
  I'll switch the code view to horizontal-scroll. (Markdown/image rendering is
  unchanged.)
- **A4 — Advanced-mode flag**, consistent with the other Files-viewer features.

## Why

The Files tab is how you read the repo from the phone, but a `.cs` file today is a
flat wall of monochrome text with no line references. Coloring + a line gutter make
it readable and let you point at "line 42" like any IDE.

## What changes

- `client/package.json` — add `highlight.js`.
- `client/src/components/files/FileViewer.jsx` — `.cs` highlight branch + line-number
  gutter rendering.
- `client/src/components/files/files.css` — gutter layout + C# token palette + switch
  the code view to non-wrapping.
- `client/src/context/UiModeContext.jsx` — `codeHighlight: 'advanced'`.

## Impact

- Affected spec: **`files`** (ADDED: C# syntax highlighting; IDE line-number gutter).
- Affected code: the client files above. **No backend change** — the file content +
  extension are already available client-side.
