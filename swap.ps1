# swap.ps1 - the ONE committed, machine-independent deploy for this self-dev repo.
#
# This repo IS Claude Web (the Harness). Deploying its own Product means:
#   build a fresh tree -> stop the running ClaudeWeb.exe -> swap binaries -> restart.
# The catch (why an agent can't "just run dotnet run"): the live exe is LOCKED while
# serving and the agent is usually HOSTED BY that exe, so killing it kills the agent.
# This script is written to be launched DETACHED so it outlives the restart, and to
# resolve every path from its own location ($PSScriptRoot) so it works on any machine
# and any checkout - no hardcoded user path, no pre-existing local setup required.
#
# LAUNCH IT DETACHED (so it survives the harness restart it performs):
#   pwsh  -File .\swap.ps1            # or:  powershell -File .\swap.ps1
#   # from an agent that must not be killed mid-swap, start it as its own process:
#   cmd /c start "" /b pwsh -NoProfile -File .\swap.ps1
#
# Flags:
#   -DryRun           build + stage + run the guard, but DO NOT stop/swap/restart live.
#   -Port <n>         port the live harness serves on (default 5099).
#   -Configuration Debug|Release  (default Debug - matches how live is built today).
#   -SkipGuard        bypass the origin/main ancestor guard (discouraged; see below).
#
# LIFECYCLE (openspec deploy-final-no-deadman): a deploy that passes the HEALTH CHECK is
# FINAL. Nothing is armed afterwards and nothing needs to be "kept". The live build is
# still snapshotted to run-bin.lastgood BEFORE the swap, for two reasons: if the health
# check FAILS right after the restart, this script restores last-good itself (rollback.ps1,
# inline); and a human can restore it on purpose at any later time (rollback.ps1 by hand,
# or the Deployments tab). There is no automatic dead-man timer any more - the harness
# always comes up these days, and the 15-minute keep ritual was only friction.
#
# SAFETY: it refuses to deploy a tree that does not contain origin/main (the guard
# that stopped parallel sessions from clobbering each other's live features - see
# docs/claude-web/self-dev.md). It STAGES the whole build BEFORE stopping live, so a
# broken build can only abort the deploy, never half-write the running dir. It MIRRORS
# with robocopy but PROTECTS runtime state (logs/, appsettings.json); the data store
# lives in %APPDATA%\ClaudeWeb and is never touched.

param(
  [int]$Port = 5099,
  [ValidateSet('Debug','Release')] [string]$Configuration = 'Debug',
  [switch]$DryRun,
  [switch]$SkipGuard,
  [int]$StartDelaySeconds = 8
)

$ErrorActionPreference = 'Stop'
$repo   = $PSScriptRoot
$stage  = Join-Path $repo '.claudeweb-deploy\bin'      # gitignored staging build
$runDir = Join-Path $repo '.selfdev-build\run-bin'     # gitignored standard run location
$lastgood = Join-Path $repo '.selfdev-build\run-bin.lastgood'  # snapshot rollback.ps1 restores
$exe    = Join-Path $runDir 'ClaudeWeb.exe'
$logDir = Join-Path $repo '.claudeweb-deploy'
$log    = Join-Path $logDir 'deploy.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
# Rotate: one log per deploy, so a reader (human or the harness) never mistakes a
# previous run's ABORT/FAILED lines for this one.
if (Test-Path $log) { Rename-Item $log ("deploy.prev.{0}.log" -f (Get-Date).Ticks) }
# Log as UTF-8 (5.1's Out-File/Tee default to UTF-16, which is awkward to grep).
function Say($m) {
  $line = ((Get-Date).ToString('s')) + '  ' + $m
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Host $line
}
function Die($m) { Say ('ABORT: ' + $m); exit 1 }

Say ("deploy start  repo=$repo  port=$Port  config=$Configuration  dryrun=$DryRun")

# ---- 1. Guard: never deploy a tree missing origin/main ----------------------
if ($SkipGuard) {
  Say 'WARNING: -SkipGuard set; bypassing the origin/main ancestor guard.'
} else {
  Say 'guard: git fetch origin'
  git -C $repo fetch origin --quiet
  if ($LASTEXITCODE -ne 0) { Die 'git fetch failed (no network/remote?). Re-run when origin is reachable, or -SkipGuard if you are certain.' }
  git -C $repo merge-base --is-ancestor origin/main HEAD
  if ($LASTEXITCODE -ne 0) {
    Die 'working tree does NOT contain origin/main. Merge main into your branch and re-verify before deploying (this prevents clobbering live features).'
  }
  Say 'guard OK: HEAD contains origin/main'
}

# ---- 2. Build + STAGE the whole tree (before touching live) ------------------
Say 'build: npm --prefix client run build'
npm --prefix (Join-Path $repo 'client') run build
if ($LASTEXITCODE -ne 0) { Die 'frontend build failed' }

Say "build: dotnet build ClaudeWeb.App ($Configuration) -> $stage"
dotnet build (Join-Path $repo 'ClaudeWeb.App\ClaudeWeb.App.csproj') -c $Configuration -o $stage --nologo
if ($LASTEXITCODE -ne 0) { Die 'backend build failed' }

# robocopy /MIR (NOT Copy-Item, which nests dist/dist). Exit codes 0-3 = success.
Say 'stage: mirror client/dist into staged build'
robocopy (Join-Path $repo 'client\dist') (Join-Path $stage 'client\dist') /MIR /R:3 /W:1 /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Die "robocopy client/dist failed (exit $LASTEXITCODE)" }

$stagedExe = Join-Path $stage 'ClaudeWeb.exe'
if (-not (Test-Path $stagedExe)) { Die "staged exe missing at $stagedExe" }
Say 'stage OK: full build present'

if ($DryRun) {
  Say 'DRY RUN: build + guard validated; NOT stopping/swapping/restarting live. Done.'
  exit 0
}

# ---- 3. Discover the live target, then standardize on run-bin ----------------
# Whatever directory live is serving from, we swap into the standard repo-relative
# run-bin and (re)start there - so every machine converges to the same lock-free
# layout, even if it was previously run in-place from bin\Debug.
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$livePid = $conn | Select-Object -First 1 -ExpandProperty OwningProcess -ErrorAction SilentlyContinue
if ($livePid) {
  $liveProc = Get-Process -Id $livePid -ErrorAction SilentlyContinue
  if ($liveProc -and $liveProc.Path) {
    $liveDir = Split-Path $liveProc.Path
    Say "live: PID $livePid serving from $liveDir"
    if ($liveDir -ne $runDir) { Say "note: migrating live from '$liveDir' to standard run-bin" }
  }
} else {
  Say "live: nothing listening on :$Port (cold deploy)"
}

# ---- 4. Stop live (release the exe lock) -------------------------------------
foreach ($c in $conn) {
  try { Say "stop: killing PID $($c.OwningProcess) on :$Port"; Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {}
}
Get-Process -Name ClaudeWeb -ErrorAction SilentlyContinue | ForEach-Object {
  try { Say "stop: killing harness PID $($_.Id)"; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
}
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
}
Start-Sleep -Seconds 2

# ---- 4b. Snapshot the current (last-good) build BEFORE overwriting it ---------
# This is what rollback.ps1 restores: inline below if the health check fails, or by a
# human on purpose later. We snapshot the build that was just serving (presumed good -
# it was live). Skip on a cold deploy: with no current build there is nothing to capture.
$haveSnapshot = $false
if (Test-Path (Join-Path $runDir 'ClaudeWeb.exe')) {
  Say 'snapshot: mirror current run-bin -> run-bin.lastgood (the manual rollback point)'
  robocopy $runDir $lastgood /MIR /XD (Join-Path $runDir 'logs') /R:3 /W:1 /NFL /NDL /NJH /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Say "WARNING: snapshot robocopy failed (exit $LASTEXITCODE) - no rollback point for this deploy" }
  else { $haveSnapshot = $true; Say 'snapshot OK: last-good captured' }
} else {
  Say 'snapshot: no current run-bin exe (cold deploy) - no last-good to capture'
}

# ---- 5. Swap binaries into run-bin, PROTECTING runtime state -----------------
# /XD logs  -> keep the live log directory
# /XF appsettings.json -> keep the operator's config (port, LAN ranges, proxy, etc.)
# The exclusion MUST be the bare file name: robocopy matches /XF against the SOURCE
# tree, so a full path under $runDir never matched and every deploy silently reset the
# operator's appsettings.json to the build's template (found 2026-09-16 when a LAN-range
# change vanished on the next swap). Verified: full-path /XF -> overwritten, bare name -> kept.
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
Say 'swap: robocopy staged build -> run-bin (preserving logs/ + appsettings.json)'
robocopy $stage $runDir /MIR /XD (Join-Path $runDir 'logs') /XF appsettings.json /R:3 /W:1 /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Die "robocopy swap failed (exit $LASTEXITCODE) - live is stopped; investigate run-bin before restart" }

# Cold-start fallback: if run-bin had no appsettings.json yet, seed it from the build.
if (-not (Test-Path (Join-Path $runDir 'appsettings.json'))) {
  $srcCfg = Join-Path $stage 'appsettings.json'
  if (Test-Path $srcCfg) { Copy-Item $srcCfg (Join-Path $runDir 'appsettings.json'); Say 'swap: seeded appsettings.json (cold start)' }
}

# ---- 6. Restart + health check (the success gate) ----------------------------
if (-not (Test-Path $exe)) { Die "exe not found at $exe after swap" }
Start-Process -FilePath $exe -WorkingDirectory $runDir
Say "restart: launched $exe"
Start-Sleep -Seconds $StartDelaySeconds
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
  try {
    # 127.0.0.1, NOT localhost: the harness binds 0.0.0.0 (IPv4-only), and
    # Invoke-WebRequest tries ::1 first. Normally the refused IPv6 attempt
    # falls back instantly, but when the ::1 SYN is silently dropped it eats
    # the whole TimeoutSec - 20 straight false failures rolled back a HEALTHY
    # deploy on 2026-08-07. Probe the address family the app actually binds.
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:$Port/api/auth/check") -UseBasicParsing -TimeoutSec 5
    Say "health: $($r.StatusCode) on :$Port"
    $healthy = $true
    break
  } catch {
    if ($i -eq 19) { Say "health: FAILED after restart - $($_.Exception.Message)" } else { Start-Sleep -Seconds 2 }
  }
}

# ---- 7. Outcome: healthy = FINAL; unhealthy = restore last-good now -----------
# The stage-before-stop guard above only catches a BUILD failure. A build that swaps
# in and then does not answer is restored to last-good right here, inline. A build
# that answers is the new live build, full stop: no timer, nothing to keep.
$rollbackPs1 = Join-Path $repo 'rollback.ps1'
if (-not $healthy) {
  if ($haveSnapshot) {
    Say 'health FAILED: rolling back to last-good NOW'
    & $rollbackPs1 -Port $Port
  } else {
    Say 'health FAILED and no last-good snapshot (cold deploy): cannot roll back. Investigate run-bin manually.'
  }
} else {
  Say "deploy FINAL: healthy on :$Port. No auto-rollback is armed and nothing needs keeping. To undo on purpose: pwsh -File .\rollback.ps1 (restores run-bin.lastgood)."
}
Say 'deploy finished'
