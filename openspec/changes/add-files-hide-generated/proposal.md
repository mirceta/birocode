# Files tab: toggle to hide bin/obj (C# build output)

## Why

C# projects carry `bin/` and `obj/` folders full of generated build output. In the Files tab's
folder tree (and fuzzy search) they're pure noise — the operator never wants to read them, but they
clutter the tree and pollute search results. There's no way to hide them today.

## What Changes

- A **toggle next to the zoom controls** at the bottom of the Files tab's tree pane that hides any
  folder named `bin` or `obj` (and their contents) from the tree.
- The toggle also excludes generated paths from the fuzzy **search** results, so a hidden folder's
  files don't surface there either.
- **Default ON** (generated folders hidden), since they're noise; the choice is **device-local**
  (localStorage), like the existing tree-zoom preference.

## Impact

- **Affected specs:** `files` (MODIFIED — adds the hide-generated tree/search behavior).
- **Affected code (frontend only):** `client/src/components/files/FilesBrowser.jsx` (state + toggle
  button + search filter), `client/src/components/files/FileList.jsx` (tree filter),
  `client/src/components/files/files.css` (bottom-bar + toggle styles), `client/src/i18n/en.json` +
  `tr.json` (label).
- **Out of scope:** no backend change (the directory listing API still returns everything; filtering
  is client-side, matching how the basic/advanced repo visibility filter already works). Only `bin`
  and `obj` are hidden — not a general ignore-list.
