# arm-rollback.ps1 - arm the deploy dead-man's switch.
#
# Registers a ONE-TIME scheduled task that runs rollback.ps1 in N minutes (default
# 15) unless the operator disarms it first with keep.ps1 ("keep it"). swap.ps1 calls
# this only after a deploy health-checks green AND a last-good snapshot exists, so the
# armed rollback always has something to restore.
#
# Lesson baked in (2026-06-12): use Register-ScheduledTask with a real DateTime, NOT
# `schtasks /SD`. /SD takes a locale-parsed date string; on this dd.MM.yyyy box it
# armed "06/12" as December 6th, so the rollback never fired and the harness stayed
# down. New-ScheduledTaskTrigger -At takes a DateTime object - no locale parsing.

param(
  [int]$Minutes = 15,
  [int]$Port = 5099,
  [string]$TaskName = 'ClaudeWebAutoRollback'
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$rollback = Join-Path $repo 'rollback.ps1'
$log = Join-Path $repo '.claudeweb-deploy\deploy.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Say($m) {
  $line = ((Get-Date).ToString('s')) + '  ' + $m
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Host $line
}

if (-not (Test-Path $rollback)) { Say "ABORT: rollback.ps1 not found at $rollback"; exit 1 }

$when = (Get-Date).AddMinutes($Minutes)
$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$rollback`" -Port $Port -TaskName `"$TaskName`""
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -Once -At $when
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Force | Out-Null
Say ("armed: $TaskName fires " + $when.ToString('yyyy-MM-dd HH:mm') + " ($Minutes min) -> rollback.ps1. Disarm with keep.ps1.")
