# One-shot deploy runner (2026-06-14). Detached because swap.ps1 kills the live
# harness (and the CLI session driving the deploy) when it restarts :5099.
#   1. swap.ps1  -- origin/main guard, mirror staged bin -> live, restart,
#                   health-check, auto-rollback on failure, write deploy ledger.
#   2. arm.ps1   -- 15-minute dead-man switch, but ONLY if the swap actually
#                   ran (exit 0) AND :5099 is healthy. The old version armed
#                   unconditionally, so a guard-BLOCKED swap (exit 1, harness
#                   untouched) still scheduled a rollback that fired 15 min
#                   later and reverted live for no reason (2026-06-14 03:10).
$ErrorActionPreference = 'Continue'
$rb = 'C:\Users\Administrator\Desktop\playground\claudeweb-rollback'
$log = 'C:\Users\Administrator\Desktop\playground\birocode\.claudeweb-deploy\deploy-run.log'
"[$(Get-Date -Format o)] deploy-run starting (swap then maybe arm)" | Out-File $log -Append -Encoding utf8

& "$rb\swap.ps1"
$swapExit = $LASTEXITCODE
"[$(Get-Date -Format o)] swap exit=$swapExit" | Out-File $log -Append -Encoding utf8

if ($swapExit -ne 0) {
    "[$(Get-Date -Format o)] swap BLOCKED/failed -- harness untouched, NOT arming rollback" | Out-File $log -Append -Encoding utf8
    exit 0
}

$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try { if ((Invoke-WebRequest -UseBasicParsing 'http://localhost:5099/api/health' -TimeoutSec 2).StatusCode -eq 200) { $healthy = $true; break } } catch { }
}
if ($healthy) {
    "[$(Get-Date -Format o)] healthy; arming dead-man switch (arm.ps1, 15 min)" | Out-File $log -Append -Encoding utf8
    & "$rb\arm.ps1" | Out-File $log -Append -Encoding utf8
} else {
    "[$(Get-Date -Format o)] NOT healthy after swap; NOT arming (swap's own auto-rollback owns recovery)" | Out-File $log -Append -Encoding utf8
}
"[$(Get-Date -Format o)] deploy-run finished" | Out-File $log -Append -Encoding utf8
