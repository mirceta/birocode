# Projects tab — folder picker

> **Status (2026-06-13):** DEPLOYED & confirmed by the End User
> (branch `feature/projects-folder-picker`, verified headless 16/16 via
> `.preview-test/projects-picker-test.mjs`).
> Supersedes the "New project" form of [projects-tab.md](projects-tab.md).
> Structured per [doc-principles.md](doc-principles.md).

## Why

The v2 "New project" form fails on a real playground:

1. **Chip wall** — every unregistered folder under the Projects Root is
   rendered as a chip (dozens: birokrat-*, bironext-*, ...). It dominates
   the page although adding a project is rare.
2. **Typo creates a folder** — a free-text name that doesn't exist is
   silently created on disk (`RepoController.cs` Add, plain-name path).
   Documented as deliberate in projects-tab.md; in practice it produced
   wrongly named folders. This plan supersedes that decision: creation
   becomes explicit, never a typo side-effect.

## What

1. **Collapse the form** — the Projects list page ends with a single
   "+ New project" button; everything below appears only after tapping it.
2. **Navigable picker instead of chips** — starts at the Projects Root,
   lists subfolders (registered ones flagged + disabled), tap to drill in,
   breadcrumb to go back up, "use this folder" to register the folder you
   are standing in. Scoped to the Projects Root subtree in v1.
3. **Explicit creation** — a "create folder here" action inside the picker
   (name prompt → mkdir → register). No other path creates directories.
4. **Name defaults right** — display name pre-fills from the picked
   folder's name; optional override stays.

Out of scope (own plans if wanted): clone-from-URL, remove/rename
project, richer project cards (branch / dirty / busy state).

## How

- **API**: extend `GET /api/repos/folders` with `?path=` (relative to the
  Projects Root, `..` rejected, must stay inside the subtree) returning
  `{ root, path, folders: [{ name, registered, isGitRepo }] }`.
  `POST /api/repos` keeps absolute-path registration (unchanged trust
  decision, see projects-tab.md) but **drops create-on-missing for plain
  names**; creation moves to an explicit `createFolder: true` flag.
- **Client**: `Projects.jsx` — replace chips + free-text folder field with
  the picker; reuse the Files tree row styling for folder rows.
- **Gating**: picker inherits the `projectsTab` capability (already
  `'basic'`); no new FEATURES entry needed.

## Done =

Headless Playwright on an isolated preview: form hidden until "+ New
project"; drilling into a subfolder lists its children; registered folders
disabled; registering an existing folder does NOT create anything on disk;
"create folder here" does; typo'd free-text can no longer create a folder.
