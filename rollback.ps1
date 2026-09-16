# rollback.ps1 - committed, machine-independent MANUAL rollback for this self-dev repo.
#
# swap.ps1 snapshots the live build (.selfdev-build\run-bin -> run-bin.lastgood) BEFORE
# it swaps. This script restores that snapshot and restarts. Two callers:
#   - swap.ps1 itself, inline, when the health check FAILS right after the restart;
#   - a human, on purpose, at any later time (by hand or from the Deployments tab).
# There is NO automatic timer any more (openspec deploy-final-no-deadman): a deploy that
# passes its health check is final. If an OLDER build left its ClaudeWebAutoRollback
# timer registered, this script still deletes it on the way out (harmless cleanup).
#
# Like swap.ps1, every path resolves from $PSScriptRoot - no hardcoded user path, so
# it works on any checkout. Safe to run manually at any time.
#
#   pwsh -File .\rollback.ps1                 # restore last-good + restart + health-check
#   pwsh -File .\rollback.ps1 -NoStart        # restore files only (used by the test)
#
# Lesson baked in (2026-06-12): robocopy /MIR, NOT Remove-Item+Copy-Item - the mirror
# survives a held handle on the target dir itself; the old copy path once nested the
# build into bin\bin and the harness never came back up.

param(
  [int]$Port = 5099,
  [string]$RunDir,
  [string]$LastGood,
  [switch]$NoStart,
  [string]$TaskName = 'ClaudeWebAutoRollback',
  [int]$StartDelaySeconds = 8
)

$ErrorActionPreference = 'Continue'
$repo = $PSScriptRoot
if (-not $RunDir)   { $RunDir   = Join-Path $repo '.selfdev-build\run-bin' }
if (-not $LastGood) { $LastGood = Join-Path $repo '.selfdev-build\run-bin.lastgood' }
$exe = Join-Path $RunDir 'ClaudeWeb.exe'
$log = Join-Path $repo '.claudeweb-deploy\rollback.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Say($m) {
  $line = ((Get-Date).ToString('s')) + '  ' + $m
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Host $line
}

Say "rollback start  runDir=$RunDir  lastgood=$LastGood  noStart=$NoStart"

# ---- Guard: nothing to restore -> leave live as-is (and drop any legacy timer) ----
if (-not (Test-Path $LastGood)) {
  Say "ABORT: no last-good snapshot at $LastGood - nothing to restore, leaving live untouched"
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  exit 1
}

# ---- Stop live (release the exe lock) ----------------------------------------
# Skipped for -NoStart (the test only exercises the file restore + self-disarm).
if (-not $NoStart) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conn) {
    try { Say "stop: killing PID $($c.OwningProcess) on :$Port"; Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {}
  }
  Get-Process -Name ClaudeWeb -ErrorAction SilentlyContinue | ForEach-Object {
    try { Say "stop: killing harness PID $($_.Id)"; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Seconds 3
}

# ---- Restore last-good, PROTECTING runtime state -----------------------------
# /XD logs -> keep the live log dir; /XF appsettings.json -> keep operator config.
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
Say 'restore: robocopy run-bin.lastgood -> run-bin (preserving logs/ + appsettings.json)'
robocopy $LastGood $RunDir /MIR /XD (Join-Path $RunDir 'logs') /XF (Join-Path $RunDir 'appsettings.json') /R:3 /W:1 /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Say "WARNING: robocopy restore failed (exit $LASTEXITCODE)" } else { Say 'restore OK' }

if ($NoStart) {
  Say 'NoStart: files restored, not launching exe'
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  Say 'rollback finished (NoStart)'
  exit 0
}

# ---- Restart + health check --------------------------------------------------
if (Test-Path $exe) {
  Start-Process -FilePath $exe -WorkingDirectory $RunDir
  Say "restart: launched $exe"
  Start-Sleep -Seconds $StartDelaySeconds
  for ($i = 0; $i -lt 20; $i++) {
    try {
      # 127.0.0.1, NOT localhost — same reason as swap.ps1's probe: the app
      # binds IPv4-only and a dropped ::1 attempt burns the whole timeout.
      $r = Invoke-WebRequest -Uri ("http://127.0.0.1:$Port/api/auth/check") -UseBasicParsing -TimeoutSec 5
      Say "health: $($r.StatusCode) on :$Port (last-good restored)"
      break
    } catch {
      if ($i -eq 19) { Say "health: FAILED after rollback - $($_.Exception.Message)" } else { Start-Sleep -Seconds 2 }
    }
  }
} else {
  Say "FATAL: exe missing at $exe after restore, nothing to start"
}

# ---- Legacy cleanup: drop an old build's auto-rollback timer if one is registered ----
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
Say 'rollback finished'
