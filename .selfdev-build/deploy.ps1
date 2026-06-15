$log = "C:\Users\km\Desktop\playground\birocode\.selfdev-build\deploy.log"
"deploy started $(Get-Date)" | Out-File $log
Start-Sleep -Seconds 20
Get-Process ClaudeWeb -ErrorAction SilentlyContinue | ForEach-Object {
  "killing harness PID $($_.Id)" | Out-File $log -Append
  Stop-Process -Id $_.Id -Force
}
Start-Sleep -Seconds 3
Set-Location C:\Users\km\Desktop\playground\birocode
"building frontend $(Get-Date)" | Out-File $log -Append
npm --prefix client run build 2>&1 | Out-File $log -Append
"building backend $(Get-Date)" | Out-File $log -Append
dotnet build ClaudeWeb.App 2>&1 | Out-File $log -Append
$exe = "C:\Users\km\Desktop\playground\birocode\ClaudeWeb.App\bin\Debug\net8.0-windows\ClaudeWeb.exe"
if (Test-Path $exe) {
  Start-Process $exe
  "started new harness $(Get-Date)" | Out-File $log -Append
  Start-Sleep -Seconds 12
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:5099/api/health" -UseBasicParsing -TimeoutSec 10
    "health check: $($r.StatusCode)" | Out-File $log -Append
  } catch {
    "health check FAILED: $($_.Exception.Message)" | Out-File $log -Append
  }
} else {
  "BUILD FAILED - exe not found, harness NOT restarted" | Out-File $log -Append
}
"deploy finished $(Get-Date)" | Out-File $log -Append
