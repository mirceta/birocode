# M3: Backend Git API

**Blocked by:** M0
**Blocks:** M7 (Frontend Save/History UI)

## Goal

Save snapshots and restore previous versions using git. All git
commands run in WorkingDirectory.

## Files You Own

- `ClaudeWeb.App/Services/GitService.cs` -- git operations (add, commit,
  log, checkout) via Process.Start
- `ClaudeWeb.App/Controllers/GitController.cs` -- POST /api/save,
  GET /api/history, POST /api/history/restore

Register your service in DI (Program.cs) and add controller routes.

## Endpoints

```
POST /api/save
  Body: { "message": "string?" }
  Runs: git add -A && git commit -m "<message or auto-generated>"
  Response: { hash: "string", message: "string" }
  If nothing to commit: { noChanges: true }

GET /api/history
  Runs: git log --format=...
  Response: [{ hash: "string", date: "string", message: "string" }]
  Most recent first. Limit to last 50 entries.

POST /api/history/restore
  Body: { "hash": "string" }
  Runs: git checkout <hash> -- .
  Response: { restored: true, hash: "string" }
```

## Implementation Notes

- Use Process.Start with RedirectStandardOutput for git commands
  (same pattern as ClaudeCliRunner uses for claude CLI)
- Auto-generated commit message when none provided:
  "Save <date> <time>" (e.g., "Save 2026-06-06 14:30")
- git log format: `--format=%H|||%ci|||%s` -- split on ||| to avoid
  JSON escaping issues in the git output
- Restore uses `git checkout <hash> -- .` (restore files only,
  do not move HEAD)
- Validate hash format before passing to git: regex `^[0-9a-f]{7,40}$`
- Log every git operation to Logger with [GIT] prefix

## Verify

```bash
# Create a test file in working dir, then save
curl -X POST http://localhost:5099/api/save \
  -H "Content-Type: application/json" \
  -d '{"message":"test save"}'
# Should return { hash, message }

# List history
curl http://localhost:5099/api/history
# Should show the new entry

# Restore
curl -X POST http://localhost:5099/api/history/restore \
  -H "Content-Type: application/json" \
  -d '{"hash":"<hash from above>"}'
# Should return { restored: true }
```

Also verify the monitoring GUI logs each git operation.

## Do Not Touch

- `ClaudeWeb.App/Services/CliRunnerService.cs` or ChatController (M1)
- `ClaudeWeb.App/Services/FileService.cs` or FileController (M2)
- `ClaudeWeb.App/UI/MainForm.cs` (M0 -- log to it via Logger, don't modify)
- Any files under `client/` (M4, M5, M6, M7)
