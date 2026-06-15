# Understanding — File size warnings (refactoring under control)

## Goal
Make oversized files visible so refactoring can be prioritized: show how many
**lines** each file has, and **warn** about files over **500 lines**.

## Confirmed decisions
- **Surface:** **Files-tab tree badges** — a line-count badge on each file row in
  the existing Files tree, turning into a warning style when the file is over
  500 lines. (No separate overview.)
- **Threshold:** **fixed constant 500** lines.
- **Scope:** **all text files** (every non-binary file), not just source code.

## Concrete things I'll do
- **Backend** (`Services/Files/FileService.cs`, the existing `/api/files`
  listing — no new endpoint, no controller change):
  - Add an `int? Lines` field to the `FileEntry` record.
  - Count lines per file in `ListDirectory` (streaming newline count;
    `lines = newlines + 1` when the last line is unterminated). Returns `null`
    for directories, binary files (NUL-byte heuristic, same as the reader), and
    files over a scan cap (5 MB) so listing stays fast.
  - The count flows to the frontend automatically (the controller returns the
    entries as-is).
- **Frontend** (`components/files/FileList.jsx`, `files.css`, i18n):
  - Render a line-count badge on each file row; apply a warning style when
    `lines > 500`. `OVERSIZE_LINES = 500` constant lives here.
  - Keep the existing byte-size display.
- New UI follows the existing Files tab (already Advanced-capable).

## Assumptions
- "Lines" = newline count of the file as stored (no language-specific logic).
- Binary files and files > 5 MB show no line badge (just the byte size).
- The badge appears as directories are expanded (the tree lists lazily,
  one directory at a time) — there is no repo-wide scan in this design.

## Verification
- Backend: line counts in `/api/files` match `wc -l` on a sample; binary files
  carry no count.
- Frontend: browser-verify on an isolated instance — badges render, files over
  500 lines show the warning style.
