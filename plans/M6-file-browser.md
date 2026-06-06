# M6: Frontend File Browser UI

**Blocked by:** M2 (File API), M4 (App Shell)
**Blocks:** nothing

## Goal

Navigate folders and read files. The user uses this to confirm that
Claude made the changes she asked for in the chat.

## Files You Own

- `client/src/pages/Files.jsx` -- replaces M4's placeholder
- `client/src/components/files/` -- all file browser components:
  - `FileList.jsx` -- list of files and folders in current directory
  - `FileViewer.jsx` -- read-only display of a single file's contents
  - `Breadcrumbs.jsx` -- navigation path (Home > folder > subfolder)

## What to Build

- **Directory listing:** shows files and folders at current path
  - Folders shown first, then files
  - Folder icon + name, tap to navigate into it
  - File icon + name + size, tap to view contents
- **File viewer:** read-only display of file contents
  - Monospace font
  - Line numbers (optional, nice to have)
  - Back button to return to directory listing
- **Breadcrumb navigation** at the top
  - Shows current path: Home > folder > subfolder
  - Tap any breadcrumb segment to jump to that level
- **Loading state** while fetching directory contents or file

## API Calls

- `GET /api/files?path=<path>` -- list directory contents
- `GET /api/files/read?path=<path>` -- read a single file

## Verify

- Open on phone viewport (375px)
- See root directory listing with files and folders
- Tap a folder -- navigates into it, breadcrumbs update
- Tap a file -- shows file contents in monospace
- Tap breadcrumb -- navigates back to that level
- Empty folder shows a friendly "No files here" message

## Do Not Touch

- `client/src/pages/Chat.jsx` or `client/src/components/chat/` (M5)
- `client/src/pages/History.jsx` or `client/src/components/history/` (M7)
- `client/src/layout/` (M4 -- use it, don't modify it)
- Any files under `ClaudeWeb.App/` (M1, M2, M3)
