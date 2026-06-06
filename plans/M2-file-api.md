# M2: Backend File API

**Blocked by:** M0
**Blocks:** M6 (Frontend File Browser UI)

## Goal

Browse and read files in the working directory over HTTP.

## Files You Own

- `ClaudeWeb.App/Services/FileService.cs` -- file listing and reading,
  path validation, security checks
- `ClaudeWeb.App/Controllers/FileController.cs` -- GET /api/files,
  GET /api/files/read

Register your service in DI (Program.cs) and add controller routes.

## Endpoints

```
GET /api/files?path=
  Response: [{ name: "string", type: "file"|"dir", size: number }]
  Default path: "/" (root of WorkingDirectory)
  Sorted: directories first, then files, alphabetical within each

GET /api/files/read?path=
  Response: { content: "string", path: "string" }
  For binary files or files over 1MB, return an error response
```

## Security (Critical)

This is the most security-sensitive module. Path traversal here means
arbitrary file read on the host machine.

- Resolve every requested path against WorkingDirectory using
  Path.GetFullPath
- After resolving, verify the result starts with WorkingDirectory
  (use string comparison with Path.DirectorySeparatorChar)
- Reject paths containing ".."
- Reject symlinks that point outside WorkingDirectory
- Return 403 for any violation, not 404 (don't leak path existence)
- Log every file access to Logger with [FILE] prefix

## Verify

```bash
# List root directory
curl 'http://localhost:5099/api/files?path=/'
# Should return JSON array of files/folders

# Read a file
curl 'http://localhost:5099/api/files/read?path=/some-file.txt'
# Should return file content

# Path traversal must fail
curl 'http://localhost:5099/api/files?path=../../etc'
# Must return 403

curl 'http://localhost:5099/api/files/read?path=../../Windows/System32/config/SAM'
# Must return 403
```

Also verify the monitoring GUI logs each file access.

## Do Not Touch

- `ClaudeWeb.App/Services/CliRunnerService.cs` or ChatController (M1)
- `ClaudeWeb.App/Services/GitService.cs` or GitController (M3)
- `ClaudeWeb.App/UI/MainForm.cs` (M0 -- log to it via Logger, don't modify)
- Any files under `client/` (M4, M5, M6, M7)
