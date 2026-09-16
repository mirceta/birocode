# keep.ps1 - kept for old habits and old runbooks: it is NO LONGER NEEDED.
#
# A deploy that passes swap.ps1's health check is FINAL (openspec deploy-final-no-deadman):
# nothing is armed after a deploy, so there is nothing to "keep". This script stays only so
# that an operator, a peer harness on an older runbook, or an agent that still says "keep it"
# gets a clear answer instead of an error. If a legacy auto-rollback timer from an OLDER
# build is still registered on this machine, it is removed here as a courtesy.
#
# Want the old build back on purpose? That is rollback.ps1 (restores run-bin.lastgood).

param([string]$TaskName = 'ClaudeWebAutoRollback')

$log = Join-Path $PSScriptRoot '.claudeweb-deploy\deploy.log'
$existing = schtasks /Query /TN $TaskName 2>$null
if ($existing) {
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  try { Add-Content -Path $log -Value (((Get-Date).ToString('s')) + "  keep: removed a legacy $TaskName timer left by an older build") -Encoding utf8 } catch {}
  Write-Host "keep is no longer needed: deploys are final when healthy. (A legacy $TaskName timer from an older build was found and removed.)"
} else {
  Write-Host 'keep is no longer needed: deploys are final when healthy. Nothing was armed, nothing to do.'
}
