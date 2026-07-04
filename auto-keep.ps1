# Auto-keep watcher (companion to swap.ps1; see plans/portable-deploy.md and the
# memory: the deploy's restart kills the agent session that would normally run
# keep.ps1 on the operator's word, so the dead-man switch always fired).
# Launch DETACHED (Start-Process) BEFORE launching swap.ps1. It waits for the
# switch to arm, re-verifies live health 3x over 90s, and only then disarms.
# A build that goes unhealthy after the swap is left armed and still rolls back.
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$log  = Join-Path $repo '.claudeweb-deploy\deploy-out.log'
$own  = Join-Path $repo '.claudeweb-deploy\auto-keep.log'
function Say($m){ Add-Content $own ("{0}  {1}" -f (Get-Date -Format s), $m) }
Say "auto-keep watcher started"

$armed = $false
for ($i = 0; $i -lt 120; $i++) {
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'DEAD-MAN SWITCH ARMED' -Quiet)) { $armed = $true; break }
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'FAILED|rolled back|abort' -Quiet)) { Say "deploy failed/aborted - not disarming"; exit }
  Start-Sleep 5
}
if (-not $armed) { Say "never saw ARMED within 10 min - exiting without disarm"; exit }

Say "switch armed - verifying health 3x over 90s"
$ok = 0
for ($i = 0; $i -lt 3; $i++) {
  Start-Sleep 30
  try {
    $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5099/api/health -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok++ } else { Say ("health returned " + $r.StatusCode) }
  } catch { Say "health check failed" }
}
if ($ok -eq 3) {
  Say "3/3 healthy - running keep.ps1"
  & powershell -NoProfile -File (Join-Path $repo 'keep.ps1') *>> $own
  Say "disarmed"
} else {
  Say "health not stable ($ok/3) - leaving rollback armed"
}
