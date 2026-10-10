# Home bridge - turn OFF (openspec change home-bridge-proxy).
# Run on the Hub from an elevated PowerShell:   powershell -ExecutionPolicy Bypass -File tools\home-bridge\uninstall.ps1
# Stops the proxy, removes the scheduled task and the firewall rule. Files and logs stay in
# %LOCALAPPDATA%\ClaudeWebHomeBridge unless -Purge is given. install.ps1 turns it back on.
# Pure ASCII on purpose (Windows PowerShell 5.1 reads scripts as ANSI).
param([switch]$Purge)

$ErrorActionPreference = 'Stop'
$taskName = 'ClaudeWebHomeBridge'
$ruleName = 'Claude Web home bridge'
$dest = Join-Path $env:LOCALAPPDATA 'ClaudeWebHomeBridge'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host ('task: ' + $taskName + ' removed')
}
Get-Process HomeBridge -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'proxy: stopped'
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule) { $rule | Remove-NetFirewallRule; Write-Host 'firewall: rule removed' }
if ($Purge -and (Test-Path $dest)) { Start-Sleep -Milliseconds 500; Remove-Item -Recurse -Force $dest; Write-Host ('files: ' + $dest + ' removed') }
Write-Host 'Home bridge is OFF. On the home computer, turn "Use setup script" off too.'
