# Files tab: toggle to hide .csproj files

## Why

C# repositories carry a `.csproj` project file per project. They're meaningful source, but when you're
reading product code they're often noise in the Files tab's folder tree (and fuzzy search). There's
no way to hide them today. This mirrors the existing bin/obj hide toggle, giving the operator a second
independent switch.

## What Changes

- A **second toggle in the same bottom bar** as the bin/obj toggle (next to the zoom controls) that
  hides files whose name ends in `.csproj` from the folder tree.
- The toggle also excludes `.csproj` paths from the fuzzy **search** results.
- **Default OFF** (`.csproj` shown): unlike `bin`/`obj`, project files are real source you usually
  want visible. The choice is **device-local** (localStorage), like the bin/obj toggle.
- The two toggles are **independent** — hiding `.csproj` does not affect bin/obj and vice versa.

## Impact

- **Affected specs:** `files` (MODIFIED — adds the hide-.csproj tree/search behavior alongside the
  existing hide-generated behavior).
- **Affected code (frontend only):** `client/src/components/files/FilesBrowser.jsx` (state + toggle
  button + search filter), `client/src/components/files/FileList.jsx` (tree filter),
  `client/src/i18n/en.json` + `tr.json` (label). No CSS change — reuses `.files-ide__filter`.
- **Out of scope:** no backend change (filtering is client-side, like the bin/obj toggle). Only
  `*.csproj` is matched — not a general file-type ignore-list.
