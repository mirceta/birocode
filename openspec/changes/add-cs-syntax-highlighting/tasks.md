# Tasks

## 1. Highlighter dependency
- [ ] Add `highlight.js` to `client/package.json`; import only `highlight.js/lib/core` + `highlight.js/lib/languages/csharp` (register the `csharp` language)

## 2. Highlighted `.cs` rendering
- [ ] In `client/src/components/files/FileViewer.jsx`, add a `CS_RE = /\.cs$/i` branch that tokenizes `content` with hljs
- [ ] Render the colored output inside `<code class="hljs language-csharp">` (sanitized hljs HTML), preserving exact text; non-`.cs`/unsupported files fall back to plain text

## 3. Line-number gutter
- [ ] Render a non-selectable left gutter of line numbers aligned 1:1 with code lines (gutter marked `aria-hidden` / `user-select:none` so copy excludes it)
- [ ] Switch the code view to non-wrapping (`white-space: pre`) with horizontal scroll so numbers stay aligned

## 4. Styling
- [ ] In `client/src/components/files/files.css`, add the gutter layout + a C# token palette tuned to the light theme (`--color-surface`/`--color-text`)

## 5. Feature flag
- [ ] Add `codeHighlight: 'advanced'` to `FEATURES` in `client/src/context/UiModeContext.jsx`; gate the highlight+gutter path, falling back to today's plain `<pre>` when off

## 6. Verify
- [ ] Headless-browser check (isolated preview): open a `.cs` file → tokens colored + gutter numbers match line count; long line scrolls horizontally with numbers still aligned; copy excludes line numbers; a non-`.cs` text file still renders fine; no console errors

## 7. Understanding app (if warranted)
- [ ] Optional: visualize the highlight pipeline + gutter alignment, if it aids understanding (else keep prose)
