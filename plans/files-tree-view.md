# Files tab -- VS Code-style folder tree

> **Status (2026-06-11):** Deployed and confirmed. Merged to main, live on
> the :5099 harness, browser-verified (`.preview-test/files-tree-test.mjs`,
> 13/13 checks pass).

## What we are building

Today, tapping a folder in the Files tab **navigates into it** (the list is
replaced by the folder's contents, breadcrumbs show where you are). We change
that to the Visual Studio / VS Code explorer model: tapping a folder
**expands it in place** -- its children appear indented underneath, tapping
again collapses it. The whole repo stays visible as one scrollable tree.

## What stays the same

- Tapping a FILE opens the preview (FileViewer), exactly as now.
- Long-pressing a file drops an `@path` reference into the chat composer.
- The `GET /files?path=` API -- no server changes. Children are fetched
  lazily, only when a folder is first expanded.
- Files tab stays a `basic` capability (this is a behavior change to an
  existing basic feature, not a new gated feature -- no new key in
  `UiModeContext.jsx`).

## What goes away

- **Breadcrumbs** on the Files page. With a tree rooted at `/` there is no
  "current directory" to show. `Breadcrumbs.jsx` is only used by the Files
  page, so it is deleted (git history keeps it).
- The `path` page-state in `Files.jsx` (the tree carries a full path per
  node instead).

## Design

### Data model (client state only)

One flat map in `Files.jsx`, keyed by full path:

```
nodes: {
  "/":          { entries: [...], state: "loaded" },
  "/client":    { entries: [...], state: "loaded" },
  "/client/src":{ entries: null,  state: "loading" | "error" },
}
expanded: Set of paths ("/client", "/client/src")
```

- Expand a folder: add to `expanded`; if its path is not in `nodes`, fetch
  `GET /files?path=` and store the result.
- Collapse: remove from `expanded`. Children stay cached in `nodes`, so
  re-expanding is instant (no refetch within the page's lifetime).
- Switching repos resets everything (same as today).

### Rendering

`FileList.jsx` becomes a recursive `FileTree`:

- A folder row shows a chevron (`>` collapsed, `v` expanded) + folder icon +
  name. Tap anywhere on the row toggles expansion.
- Children render directly below, indented one level (CSS
  `padding-left` per depth -- depth passed as a prop).
- A folder that is expanding shows a small inline loading row; a fetch error
  shows an inline error row with retry (NOT the full-page ErrorBanner, which
  stays for the root listing only).
- Folders sort before files within each level (matches VS Code; the server
  may already do this -- verify, otherwise sort client-side).
- Long-press wiring moves into the tree row: each node knows its own full
  path, so `@reference` no longer depends on a page-level `path`.

### Touched files (all under client/, no server changes)

| File | Change |
|---|---|
| `client/src/pages/Files.jsx` | Replace path/entries state with nodes/expanded tree state; drop Breadcrumbs |
| `client/src/components/files/FileList.jsx` | Becomes recursive FileTree with chevrons, indentation, inline loading/error rows |
| `client/src/components/files/Breadcrumbs.jsx` | DELETE |
| `client/src/components/files/files.css` | Chevron, indentation, inline loading/error row styles |
| `client/src/i18n/*` | Keys for inline "loading"/"retry" row if not already present |

## Open decisions (settle before implementing)

1. **Expansion memory across tab switches.** The Files page unmounts when
   you switch tabs, so the tree collapses and refetches on return. Keeping
   the expanded set + cache in a context (like ChatContext does for the
   draft) would preserve it. Proposal: ship without it first, add only if
   the collapse-on-return annoys in practice.
2. **Refresh semantics.** Cached children can go stale while Claude edits
   files. Proposal: collapse->expand within a session uses cache; leaving
   and re-entering the Files tab refetches naturally (no explicit refresh
   button yet).
3. **Deep tree indentation on a phone.** Long paths at depth 5+ eat
   horizontal space. Proposal: small per-level indent (12-16px) and let
   names ellipsize; no horizontal scroll.

## Verification

- `npm --prefix client run build` passes.
- Playwright check per `docs/claude-web/browser-testing.md`: expand a folder
  (children appear indented), collapse it, expand two siblings at once,
  open a file from depth 2, long-press a nested file and confirm the chat
  draft gets the full `@dir/sub/file` path, switch repos and confirm the
  tree resets.
