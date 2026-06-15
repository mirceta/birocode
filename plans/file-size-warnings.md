# File size warnings — refactoring under control

> **Status (2026-06-15):** **Deployed to live :5099 & merged to main.** On
> `feature/file-size-warnings`. Surfaces per-file **line counts** as a badge on
> each Files-tab row and **warns** when a file is over **500 lines**. Design:
> tree badges (no separate overview), fixed 500-line constant, all text files.
> Browser-verified on the live app (`GitService.cs` → ⚠️ 763 L).

## Problem

The repo has no visibility into which files have grown too large. To "get
refactoring under control" we want to see, per file, how many lines it has and
which ones exceed a sane ceiling (500 lines). The Files tab shows byte sizes per
row but no line counts.

## Design

Extend the existing **Files module** — no new endpoint, no controller change.

### Backend (`Services/Files/FileService.cs`)
- Add `int? Lines` to the `FileEntry` record.
- Count lines per file in `ListDirectory` via a streaming newline count
  (`lines = newlines + 1` when the final line is unterminated). Returns `null`
  for directories, binary files (NUL-byte heuristic, matching the reader), and
  files over a 5 MB scan cap (keeps listing fast; such files are usually
  data/minified). The controller already returns entries as-is, so the count
  reaches the frontend automatically.

### Frontend (`components/files/FileList.jsx`, `files.css`, i18n)
- Render a line-count badge on each file row; apply a warning style when
  `lines > 500`. `OVERSIZE_LINES = 500` lives here. Keep the byte-size display.

## Verification

- Backend: counts in `/api/files` match `wc -l` on a sample; binary files carry
  no count.
- Frontend: browser-verify (per `docs/claude-web/browser-testing.md`) on an
  isolated instance — badges render and files over 500 lines show the warning
  style.
