# Files tab — IDE mode (split tree/viewer + fuzzy search)

> **Update (2026-06-21):** added an **adjustable folder browser** — a
> **drag-to-resize divider** (`.files-ide__resizer`, pointer events → mouse +
> touch; width device-local, clamped so the file view keeps ≥120px) and a
> **tree zoom** (A−/%/A+ footer scaling rows + search results via a
> `--tree-zoom` var scoped to the browser pane; range **40%–180%**,
> device-local, click % to reset).
> Browser-verified on the isolated `:5252` preview: drag widens/narrows + min
> clamp, both prefs persist across reload, reset works, **0 console errors**;
> the understanding-app mockup mirrors both. Frontend-only; backend untouched.
>
> **Status (2026-06-21):** **Slice 1 built & verified on an isolated preview.**
> On `feature/files-ide-mode` (off `main`). IDE split (tree + viewer), fuzzy
> search, and the show/hide-browser toggle render identically on the Files tab
> and the agent dock — browser-verified on an isolated `:5252` harness (tab:
> split + plan.md open + fuzzy `fileside`→2 hits + collapse; dock: same in a
> phone, 23 rows + 124 search hits + collapse; **0 console errors** on both).
> A backend recursive index (`GET /api/files/all`, skips VCS/build/deps, caps
> 20k) powers whole-repo search — **resolved** the "search scope" open decision
> toward whole-repo. Frontend builds clean; backend builds clean. **Not yet
> deployed to live or committed.** Search match = subsequence fuzzy (open
> decision still: fuzzy vs substring — currently fuzzy).

## Problem

The Files tab is **single-column**: you see the folder tree, click a file, and
the viewer **replaces** the tree. To open another file you hit ← back to the
tree, re-find it, click again. There's **no search** — on a big repo you scroll
and expand folders by hand. This is the opposite of how an IDE works, where the
tree stays put on the left and files open beside it.

## Goal

An **IDE-style Files tab**:

1. **Split layout** — folder/file **tree on the left**, the **selected file's
   view on the right**, both visible at once. Clicking a file in the tree swaps
   the right pane without losing your place in the tree. **The same split is used
   on both surfaces** — the Files tab and the agent dock — even though it's
   cramped in the dock (accepted; no per-surface fork).
2. **Fuzzy search** over the tree + files — a search box that matches files by
   fuzzy path, so you can jump straight to a file by typing part of its name
   instead of expanding folders.
3. **Show/hide the folder browser** — a toggle that collapses the whole left
   pane (tree + search) so the file view takes the **full width**; the choice is
   remembered per device.

## What exists today (recon)

- **`client/src/components/files/FilesBrowser.jsx`** (~380 lines) is the shared
  core. It owns: `expanded` (Set of open dirs), `openFile`, file content/image,
  pins, doc-link history, 5s live-poll, and localStorage view persistence.
- **`FileList.jsx`** renders the recursive tree (lazy-loads each dir via
  `GET /api/files?path=…`, entries are `{name, type, lines?, size?}`).
- **`FileViewer.jsx`** renders an open file (Markdown / sandboxed-HTML iframe /
  image blob / `<pre>` text) with a bar (back, history, pin, raw/rendered).
- Layout (`files.css`) is **mutually exclusive**: pins strip + tree, **or** the
  viewer. No split, no search UI today.
- `FilesBrowser` is reused in **two** places:
  - the routed Files tab (`pages/Files.jsx`, `repoId={currentRepoId}`)
  - the **agent dock** (`components/dashboard/PinnedAgent.jsx`,
    `repoId={tab.repoId}`) inside `.phone__screen` (narrow, `overflow:hidden`;
    relies on the child scrolling internally — a split must not clip it).
- New-feature gating lives in **`client/src/context/UiModeContext.jsx`** —
  add a key to the `FEATURES` map, default **`'advanced'`**; read with
  `useFeature('…')`.

## Approach

Frontend-only, reusing the existing endpoints (`/api/files`, `/api/files/raw`,
pins). Add IDE mode **inside `FilesBrowser`** so both surfaces share one source
of truth, switched by a layout flag — not a fork.

### Slice 1 — split pane (tree left, viewer right) + collapsible browser

- New capability **`filesIdeMode: 'advanced'`** in `UiModeContext`.
- When IDE mode is on, render a **two-pane flex layout**: tree (left, fixed
  width) + viewer (right, flex). The tree stays mounted; `openFile` drives only
  the right pane. **The same split renders on both surfaces** — the routed tab
  and the agent dock — just narrower in the dock.
- **Show/hide folder browser:** a toggle (in the bar) collapses the left pane
  (tree + search) → viewer goes full width. State in `localStorage`
  (`claudeweb_files_browser_open`, default open), per device, like the other
  Files view prefs.
- **Decided (was open):** dock does **not** get a drawer or a stacked fallback —
  it renders the **same split** as the tab. The cramped look is accepted.
  Verified as a clickable mockup in the Understanding app (both surfaces +
  collapse toggle, 0 console errors).
- When the capability is **off** (Basic mode), keep today's stacked
  tree-or-viewer everywhere.
- CSS: keep the root containers flex with no new internal scroll traps, so
  `.phone__screen`'s `overflow-y:auto` still works (the dock embed must not clip).

### Slice 2 — fuzzy search

- A **search box** above the tree in the left pane. Typing fuzzy-filters to
  matching file paths; Enter / click opens the top result in the right pane.
- **Fuzzy = subsequence** match over the file path (folder + name), client-side.
  *(Open decision: subsequence fuzzy vs the substring filter used for Ideas —
  default fuzzy, since the request said "fuzzy".)*
- **Search scope** *(open decision)*: MVP searches files in **already-loaded /
  expanded** folders; a follow-up can fetch a **recursive index** so whole-repo
  search works from a cold tree (would add a recursive `/api/files` listing or
  a `?recursive=1` flag — the only place a backend change might be needed).

## Decisions to confirm

- ~~**Dock behaviour:**~~ **resolved** — dock gets the responsive **drawer**
  (IDE mode on both surfaces), not a stacked fallback.
- **Search match style:** subsequence fuzzy (default) vs substring.
- ~~**Search scope:**~~ **resolved** — built the whole-repo recursive index
  (`GET /api/files/all`) from the start, not loaded-folders-only.

## Out of scope (for now)

- Editing files in the viewer (Files is read-only browse/view today).
- Multiple open tabs/buffers in the right pane.
- A resizable splitter is a nice-to-have, not required for slice 1 (a sensible
  fixed tree width is fine to start).

## Testing

Per repo convention, **browser-verify on an isolated port** (not just curl)
before claiming it works: IDE split renders tree+viewer side by side, clicking a
tree file swaps only the right pane, fuzzy search narrows + opens a file, Basic
mode and the agent dock still render the old stacked view without clipping. No
console errors / failed requests.
