# M7: Frontend Save/History UI

**Blocked by:** M3 (Git API), M4 (App Shell)
**Blocks:** nothing

## Goal

Save current state and browse/restore previous saves. No git jargon
anywhere -- the user sees "Save" and "Go back", never "commit" or
"checkout".

## Files You Own

- `client/src/pages/History.jsx` -- replaces M4's placeholder
- `client/src/components/history/` -- all history components:
  - `SaveHandler.jsx` -- logic for the global Save button
  - `NoteModal.jsx` -- optional note input when saving
  - `HistoryTimeline.jsx` -- list of previous saves
  - `RestoreConfirm.jsx` -- confirmation dialog before restoring

## What to Build

- **Save button handler:**
  - The Save button is defined in M4's shell (Layout component)
  - M7 provides the onClick handler that M4 will call
  - Export a `useSave()` hook or similar that M4 can import
  - On tap: optionally show NoteModal, then POST /api/save
  - Show success/failure feedback (toast or inline message)
- **History timeline:**
  - List of saves, most recent first
  - Each entry shows: date/time + note (or "No description")
  - Friendly date formatting ("Today 2:30 PM", "Yesterday", etc.)
- **Restore ("Go back"):**
  - "Go back to this version" button on each history entry
  - Confirmation dialog: "This will undo changes since this save.
    Continue?" with Cancel / Go Back buttons
  - POST /api/history/restore on confirm
  - Show success feedback

## Integration with M4 (App Shell)

The Save button lives in M4's layout. To connect it:

1. M7 exports a `useSave()` hook from `client/src/components/history/SaveHandler.jsx`
2. M4's Layout component imports and calls this hook
3. Until M7 is built, M4 uses a placeholder alert

This means M4 must be updated slightly when M7 is integrated.
Do not modify M4's layout files yourself -- coordinate or leave
a clear note about the integration point.

## API Calls

- `POST /api/save` -- save current state
- `GET /api/history` -- list of previous saves
- `POST /api/history/restore` -- restore to a specific save

## Verify

- Make a visible change to a file (via chat or manually)
- Tap Save -- optional note modal appears
- Enter a note and confirm -- success feedback shown
- Go to History tab -- new entry appears at top
- Tap "Go back" on an older entry -- confirmation dialog appears
- Confirm -- files are restored to that state
- Save with no changes -- shows "Nothing to save" message

## Do Not Touch

- `client/src/pages/Chat.jsx` or `client/src/components/chat/` (M5)
- `client/src/pages/Files.jsx` or `client/src/components/files/` (M6)
- `client/src/layout/` (M4 -- leave integration notes, don't modify)
- Any files under `ClaudeWeb.App/` (M1, M2, M3)
