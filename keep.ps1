# keep.ps1 - disarm the deploy dead-man's switch ("keep it").
#
# Deletes the scheduled rollback task so the freshly deployed harness STAYS live.
# Run this once you have confirmed the new build is healthy. If nothing was armed
# (e.g. a cold deploy, or already disarmed) it is a harmless no-op.

param([string]$TaskName = 'ClaudeWebAutoRollback')

$log = Join-Path $PSScriptRoot '.claudeweb-deploy\deploy.log'
$existing = schtasks /Query /TN $TaskName 2>$null
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

$stamp = ((Get-Date).ToString('s')) + '  keep: disarmed ' + $TaskName
try { Add-Content -Path $log -Value $stamp -Encoding utf8 } catch {}

if ($existing) { Write-Host "kept: auto-rollback disarmed ($TaskName deleted). The deployed build stays live." }
else           { Write-Host "nothing to disarm: $TaskName was not armed." }
