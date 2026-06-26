# Tasks

## 1. Highlighter dependency
- [x] Add `highlight.js` to `client/package.json`; import only `highlight.js/lib/core` + `highlight.js/lib/languages/csharp` (register the `csharp` language)

## 2. Highlighted `.cs` rendering
- [x] In `client/src/components/files/FileViewer.jsx`, add a `CS_RE = /\.cs$/i` branch that tokenizes `content` with hljs
- [x] Render the colored output inside `<code class="hljs language-csharp">` (sanitized hljs HTML), preserving exact text; non-`.cs`/unsupported files fall back to plain text

## 3. Line-number gutter
- [x] Render a non-selectable left gutter of line numbers aligned 1:1 with code lines (gutter marked `aria-hidden` / `user-select:none` so copy excludes it)
- [x] Switch the code view to non-wrapping (`white-space: pre`) with horizontal scroll so numbers stay aligned

## 4. Styling
- [x] In `client/src/components/files/files.css`, add the gutter layout + a C# token palette tuned to the light theme (`--color-surface`/`--color-text`)

## 5. Feature flag
- [x] Add `codeHighlight: 'advanced'` to `FEATURES` in `client/src/context/UiModeContext.jsx`; gate the highlight+gutter path, falling back to today's plain `<pre>` when off

## 6. Verify
- [x] Headless-browser check (isolated preview): open a `.cs` file → tokens colored + gutter numbers match line count; long line scrolls horizontally with numbers still aligned; copy excludes line numbers; a non-`.cs` text file still renders fine; no console errors
  - Playwright mounted the real `FileViewer` (access-code gate blocked the full UI): 20 hljs token spans colored; gutter 19 == code 19 lines, tops aligned (Δ0px); body scrollWidth 1463 > clientWidth 898 (long line scrolls); select-all copy includes code, excludes line numbers; `.txt` file → 4-line gutter, 0 hljs spans; no console errors.

## 7. Understanding app (if warranted)
- [x] Not warranted — single self-contained component, no cross-piece flow to visualize; prose + verification screenshot suffice.
