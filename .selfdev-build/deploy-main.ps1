$ErrorActionPreference = 'Continue'
$log = "C:\Users\km\Desktop\playground\birocode\.selfdev-build\deploy-main.log"
"deploy started $(Get-Date -Format o)" | Out-File $log
# Let the launching Claude Code session/turn settle and detach first.
Start-Sleep -Seconds 8
Get-Process ClaudeWeb -ErrorAction SilentlyContinue | ForEach-Object {
  "killing harness PID $($_.Id)" | Out-File $log -Append
  Stop-Process -Id $_.Id -Force
}
Start-Sleep -Seconds 3
Set-Location C:\Users\km\Desktop\playground\birocode
"building backend (dotnet build ClaudeWeb.App)..." | Out-File $log -Append
dotnet build ClaudeWeb.App 2>&1 | Out-File $log -Append
$exe = "C:\Users\km\Desktop\playground\birocode\ClaudeWeb.App\bin\Debug\net8.0-windows\ClaudeWeb.exe"
if (Test-Path $exe) {
  Start-Process $exe
  "started new harness $(Get-Date -Format o)" | Out-File $log -Append
  Start-Sleep -Seconds 14
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:5099/api/health" -UseBasicParsing -TimeoutSec 10
    "health check: $($r.StatusCode)" | Out-File $log -Append
  } catch {
    "health check FAILED: $($_.Exception.Message)" | Out-File $log -Append
  }
} else {
  "BUILD FAILED - exe not found, harness NOT restarted" | Out-File $log -Append
}
"deploy finished $(Get-Date -Format o)" | Out-File $log -Append
