<#
.SYNOPSIS
  Pull-main-redeploy slice 1 (plans/pull-main-redeploy.md), option (A):
  redeploy the live Harness from the latest origin/main WITHOUT touching the
  current branch checkout.

  Steps: fetch origin -> fast-forward LOCAL main (best-effort) -> build
  origin/main in an isolated git WORKTREE (so the working tree's branch and
  edits are untouched) -> HEALTH-CHECK the new build on a temp port BEFORE
  killing anything -> only then swap it live. A bad build can never brick the
  live harness because the swap is gated on the temp-port health check.

  Self-dev rule (docs/claude-web/self-dev.md): never build into the running
  app's own bin/ or port. We build in the worktree and run live from a copy.

.NOTES
  Launched DETACHED by DeployService.PullMainRedeploy (it restarts the harness,
  so it must outlive the request) — same pattern as rollback.ps1.

  Error handling: ErrorActionPreference is 'Continue', NOT 'Stop'. Under 'Stop',
  PowerShell 5.1 turns a native command's informational stderr (e.g. git's
  "Preparing worktree (detached HEAD ...)") into a terminating error. So we let
  native git/npm/dotnet run, check $LASTEXITCODE explicitly, and mark only the
  cmdlets that MUST abort with -ErrorAction Stop.
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoPath,
  [int]$Port = 5099,        # live port to swap onto
  [int]$HealthPort = 5201,  # temp port for the pre-swap health check (5200 = product preview)
  [switch]$NoSwap           # dry-run: build + health-check origin/main, then stop (live untouched)
)

$ErrorActionPreference = 'Continue'
$scaffold = Join-Path $RepoPath '.selfdev-build'
if (-not (Test-Path $scaffold)) { New-Item -ItemType Directory -Path $scaffold -ErrorAction Stop | Out-Null }
$log = Join-Path $scaffold 'deploy-main.log'
function Log($m) { "$(Get-Date -Format o)  $m" | Out-File $log -Append -Encoding utf8 }
"deploy-main started $(Get-Date -Format o) (NoSwap=$NoSwap)" | Out-File $log -Encoding utf8

# Run a git command against the repo, log its output, return its exit code.
function RunGit { param([Parameter(ValueFromRemainingArguments = $true)][string[]]$a)
  (& git -C $RepoPath @a 2>&1) | Out-File $log -Append -Encoding utf8
  return $LASTEXITCODE
}

# Ensure the build toolchain is on PATH. The harness spawns this script
# DETACHED, and that context can lack node/npm/dotnet that an interactive shell
# has on PATH (the nodejs dir provides both node.exe and npm.cmd).
function EnsureTool($exe, $dirs) {
  if (Get-Command $exe -ErrorAction SilentlyContinue) { return }
  foreach ($d in $dirs) {
    if ($d -and (Test-Path (Join-Path $d $exe))) { $env:PATH = "$d;$env:PATH"; Log "PATH += $d (for $exe)"; return }
  }
  Log "WARN: $exe not found on PATH nor in known install dirs"
}
EnsureTool 'node.exe' @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs", "$env:LOCALAPPDATA\nodejs")
EnsureTool 'dotnet.exe' @("$env:ProgramFiles\dotnet")

# Resolve the node install dir explicitly. The frontend build runs in a `cmd`
# child, and npm's node_modules\.bin\vite.cmd shells out to bare `node` — which
# is "not recognized" unless node's dir is on the child's PATH. Inherited PATH is
# unreliable here (Get-Command can resolve node via a path cmd cannot use), so we
# build with an explicit Windows PATH (proven recipe), not the inherited one.
$NodeDir = @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs", "$env:LOCALAPPDATA\nodejs") |
  Where-Object { Test-Path (Join-Path $_ 'node.exe') } | Select-Object -First 1
if (-not $NodeDir) { $NodeDir = "$env:ProgramFiles\nodejs" }

$wt = Join-Path $RepoPath '.claudeweb-deploy-main'   # build worktree (origin/main)
$live = Join-Path $RepoPath '.selfdev-live'          # where live runs from (a copy)

# Remove the build worktree. node_modules is COPIED into the worktree (step 4),
# not junctioned, so a recursive delete is fully isolated — it can never reach
# the main checkout's shared node_modules. -f -f also overrides a worktree left
# LOCKED ("initializing") by an interrupted run.
function RemoveWorktree($path) {
  RunGit worktree remove --force --force $path | Out-Null
  if (Test-Path $path) { Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue }
  RunGit worktree prune | Out-Null
}

try {
  # 1. Fetch origin and resolve the commit we will deploy.
  if ((RunGit fetch origin --quiet) -ne 0) { Log 'git fetch origin FAILED'; exit 1 }
  $sha = (& git -C $RepoPath rev-parse origin/main 2>$null | Out-String).Trim()
  if (-not $sha) { Log 'origin/main not found'; exit 1 }
  Log "origin/main = $sha"

  # 2. Fast-forward the LOCAL main ref from origin (the "pull main" half).
  #    Best-effort: refused if main is the checked-out branch, but we build
  #    origin/main directly regardless, so a non-zero here is not fatal.
  if ((RunGit fetch origin main:main) -eq 0) { Log 'local main fast-forwarded' }
  else { Log 'local main FF skipped (not fast-forward or main is checked out)' }

  # 3. Isolated worktree checked out at origin/main. Clean up any stale one
  #    first (junction-safe), then add --detach so the working tree's branch
  #    checkout stays untouched.
  RemoveWorktree $wt
  if ((RunGit worktree add --force --detach $wt $sha) -ne 0) { Log 'worktree add FAILED'; exit 1 }
  Log "worktree added at $wt"

  # 4. Build frontend + backend from the worktree into its own bin (gitignored).
  #    Reuse the main checkout's installed deps via a junction rather than a cold
  #    `npm install`, which in a fresh worktree is slow and hits EPERM/long-path
  #    failures cleaning a partial node_modules. vite only READS node_modules, so
  #    the shared tree is not mutated (bar a benign .vite cache write). Falls back
  #    to a real install only if the main checkout has no node_modules.
  $bin = Join-Path $wt 'bin'
  $srcNm = Join-Path $RepoPath 'client\node_modules'
  $wtNm = Join-Path $wt 'client\node_modules'
  # COPY (not junction) the main checkout's installed deps into the worktree.
  # A junction inside the worktree is a footgun: any recursive delete of the
  # worktree can follow it and wipe the REAL shared node_modules. A copy is
  # isolated. robocopy /MT is fast and long-path-safe; its exit codes 0-7 mean
  # success, so it must not be treated as a failure (we gate on the dist check).
  if (Test-Path $srcNm) {
    (& robocopy "$srcNm" "$wtNm" /E /MT:16 /NFL /NDL /NJH /NJS /NP) | Out-File $log -Append -Encoding utf8
    Log "copied node_modules into worktree"
  }
  # Build the frontend in ONE cmd that (1) sets an explicit Windows PATH so node
  # and npm resolve for npm AND for the node child that vite.cmd spawns, and
  # (2) cd's into the client dir — Set-Location in PowerShell does NOT change a
  # native child's working dir, so the cd must happen inside the cmd itself.
  $buildPath = "$NodeDir;%SystemRoot%\System32;%SystemRoot%"
  if (-not (Test-Path $wtNm)) {
    Log 'no node_modules in main checkout; cold-installing in worktree'
    (& cmd /c "set `"PATH=$buildPath`" && cd /d `"$wt\client`" && npm install" 2>&1) | Out-File $log -Append -Encoding utf8
  }
  (& cmd /c "set `"PATH=$buildPath`" && cd /d `"$wt\client`" && npm run build" 2>&1) | Out-File $log -Append -Encoding utf8
  if (-not (Test-Path "$wt\client\dist\index.html")) { Log 'FRONTEND BUILD FAILED — no dist; live untouched'; RemoveWorktree $wt; exit 2 }
  (& dotnet build "$wt\ClaudeWeb.App\ClaudeWeb.App.csproj" -c Debug -o $bin 2>&1) | Out-File $log -Append -Encoding utf8
  Copy-Item "$wt\client\dist" "$bin\client\dist" -Recurse -Force -ErrorAction Stop
  $exe = Join-Path $bin 'ClaudeWeb.exe'
  if (-not (Test-Path $exe)) { Log 'BACKEND BUILD FAILED — exe not found; live untouched'; RemoveWorktree $wt; exit 2 }
  Log 'build ok'

  # 5. Health-check the new build on a TEMP port before touching live.
  $env:CLAUDEWEB_PORT = "$HealthPort"
  $probe = Start-Process $exe -PassThru
  Start-Sleep -Seconds 12
  $healthy = $false
  try {
    $r = Invoke-WebRequest "http://localhost:$HealthPort/api/health" -UseBasicParsing -TimeoutSec 10
    $healthy = ($r.StatusCode -eq 200)
  } catch { Log "health check error: $($_.Exception.Message)" }
  Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\CLAUDEWEB_PORT -ErrorAction SilentlyContinue
  if (-not $healthy) { Log 'NEW BUILD UNHEALTHY — live untouched'; exit 3 }
  Log "new build healthy on :$HealthPort"

  if ($NoSwap) {
    Log 'NoSwap: verified origin/main build, stopping before live swap'
    RemoveWorktree $wt
    exit 0
  }

  # 6. Swap live: stop the running harness, copy the verified build to the live
  #    dir (so live never runs from the worktree, which we then remove), restart.
  Get-Process ClaudeWeb -ErrorAction SilentlyContinue | ForEach-Object {
    Log "stopping live harness PID $($_.Id)"; Stop-Process -Id $_.Id -Force
  }
  Start-Sleep -Seconds 3
  if (Test-Path $live) { Remove-Item $live -Recurse -Force -ErrorAction Stop }
  Copy-Item $bin $live -Recurse -Force -ErrorAction Stop
  $env:CLAUDEWEB_PORT = "$Port"
  Start-Process (Join-Path $live 'ClaudeWeb.exe')
  Log "swapped live to origin/main $sha on :$Port"
  Start-Sleep -Seconds 12
  try {
    $r = Invoke-WebRequest "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 10
    Log "live health after swap: $($r.StatusCode)"
  } catch { Log "live health after swap FAILED: $($_.Exception.Message)" }

  # 7. Remove the worktree (live runs from the copy, so it is not locked now).
  RemoveWorktree $wt
  Log 'done'
}
catch {
  Log "FATAL: $($_.Exception.Message)"
  RemoveWorktree $wt
  exit 4
}
