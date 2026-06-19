# Chat system tests

Black-box system tests for the Chat feature (`plans/chat-system-tests.md`). They
drive the **running Harness** over the same HTTP/SSE surface the frontend uses —
real auth cookie, real SSE streams, real on-disk session files, and (for the
real-run suite) the real Claude CLI.

They run against an **isolated instance** with its own data dir, so real CLI
turns and repo registrations never touch the operator's live `:5099` store.

## Layout

| File | Layer | Token cost |
|------|-------|------------|
| `lib.mjs` | shared: login, repo-scoped fetch, SSE reader, assertions, findings | — |
| `behavioural.mjs` | auth gate, validation, stop-when-idle, runs/sessions shape, traversal (scenarios 1-2,5-9 protocol) | none |
| `smoke.mjs` | one cheap real turn — confirms the CLI is reachable before the full suite | tiny |
| `realrun.mjs` | basic/resume/409/ask-concurrency/stop/reattach/model/tool/ask-read-only (scenarios 3,4,5,6,10-14) | yes |
| `badinput.mjs` | scenario 9 with malformed *real* inputs (ghost session, bad model/lane/sid) | small |

## Launch an isolated instance

The isolation hinges on two things: a fresh `CLAUDEWEB_DATADIR` (own store +
auth, see the `AppPaths.DataDir` knob) and running the binaries from **outside**
the repo tree so `Program.FindRepoRoot()` finds no `ClaudeWeb.sln` and does NOT
auto-pin this repo as the default target.

```bash
# 1. Build the backend to an isolated dir (frontend not needed for API tests)
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin

# 2. Copy the binaries OUTSIDE the repo + make a scratch datadir and git repo
ROOT="$LOCALAPPDATA/cw-systest"   # e.g. C:/Users/<you>/AppData/Local/Temp/cw-systest
mkdir -p "$ROOT/datadir" "$ROOT/scratch-repo"
robocopy .claudeweb-preview/bin "$ROOT/bin" /MIR   # (disable MSYS path conv on Git Bash)
git -C "$ROOT/scratch-repo" init -q && echo hello > "$ROOT/scratch-repo/README.md"
git -C "$ROOT/scratch-repo" add -A && git -C "$ROOT/scratch-repo" commit -qm init

# 3. Run it on an isolated port with a fresh datadir + known seed password
CLAUDEWEB_DATADIR="$ROOT/datadir" CLAUDEWEB_Port=5310 \
  CLAUDEWEB_AuthPassword=systest-pw-9912 "$ROOT/bin/ClaudeWeb.exe" &

# 4. Register the scratch repo as the test target, note its id
curl -s -c jar -X POST http://localhost:5310/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"systest-pw-9912"}'
curl -s -b jar -X POST http://localhost:5310/api/repos \
  -H 'Content-Type: application/json' \
  -d '{"Folder":"<ROOT>/scratch-repo","Name":"scratch","Visibility":"advanced"}'
#   -> {"id":"<RID>", ...}
```

## Run

```bash
export BASE=http://localhost:5310 PW=systest-pw-9912 MODEL=claude-haiku-4-5
export RID=<the scratch repo id> SCRATCH=<ROOT>/scratch-repo

node tests/chat-systest/behavioural.mjs   # free
node tests/chat-systest/smoke.mjs         # tiny — sanity before spending
node tests/chat-systest/realrun.mjs       # spends tokens
node tests/chat-systest/badinput.mjs      # spends a little
```

Each script exits non-zero if any check fails, prints a `PASS`/`FAIL` line per
check, and ends with a findings summary — so they can gate CI later.

## Teardown

Kill the isolated `ClaudeWeb.exe` process tree and delete `$ROOT`. Your live
`:5099` store is never touched (separate datadir), so there's nothing to restore.
