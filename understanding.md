# Understanding — Files tab "IDE mode"

## Latest request (2026-06-21): make the folder pane adjustable

On top of the shipped IDE split, add two ways to size the **left folder browser**:

- **Drag-to-resize border** — a draggable divider between the folder browser and
  the file view; drag it to set the browser's width. Width is remembered per
  device, clamped so the file view always keeps room (works on the tab and,
  via pointer events, on touch in the dock).
- **Zoom the folder tree** — small **A− / % / A+** controls that scale the tree
  (and search-result) text + rows up/down, so you can fit more rows or read them
  bigger. Zoom level is remembered per device and scoped to the browser pane only
  (the file view is untouched). Clicking the % resets to 100%.

Both are device-local prefs (like the show/hide-browser toggle) and only exist in
IDE mode.

## The goal

Give the **Files tab** an **IDE-style split layout**: the folder/file tree on
the **left**, the selected file's view on the **right** (instead of today's
single column where the viewer *replaces* the tree). Add a **fuzzy search** over
the folder tree and files so you can jump to a file by typing part of its name.

## What I'll do

- **Split-pane layout** in `FilesBrowser` (the shared core used by both the
  routed Files tab and the agent dock): tree pane left, viewer pane right, with
  the viewer staying mounted while you click around the tree.
- **Same layout on both surfaces** — the Files tab *and* the agent dock get the
  **identical** split, even though it's cramped in the narrow dock (confirmed:
  that's wanted, no per-surface drawer/fork).
- **Show/hide the folder browser** — a toggle that collapses the whole left pane
  (tree + search) so the file view takes the **full width**; remembered per
  device.
- **Fuzzy file search**: a search box above the tree that filters/jumps to files
  by fuzzy-matching the path; picking a result opens it in the right pane.
- **Gate it behind a new `'advanced'` capability flag** (new features default to
  Advanced) so Basic mode keeps today's simpler single-column behaviour.

## Assumptions (tell me if any are wrong)

- IDE mode uses the **same split layout on both** the routed Files tab and each
  agent dock — no responsive drawer, no per-surface fork; it's just narrower in
  the dock and that's accepted. (See it in the Understanding app: both surfaces
  mocked up, clickable, with the show/hide-browser toggle.)
- Fuzzy search matches against the **file path** (folder + name), is
  client-side, and is **subsequence** fuzzy (since you said "fuzzy"; the repo
  also has a substring filter for Ideas — easy to switch the feel if wanted).
- Search needs the tree's file list; an early slice may search **already-loaded**
  folders, with a follow-up to fetch a full recursive index if you want
  whole-repo search from a cold tree.
- MVP is **frontend-only** (reuses the existing `/api/files`, `/api/files/raw`,
  pins endpoints); no backend change unless whole-repo search needs a recursive
  listing endpoint.
