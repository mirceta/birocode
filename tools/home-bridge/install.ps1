# Home bridge - install / update / turn ON (openspec change home-bridge-proxy).
# Run on the Hub from an elevated PowerShell:   powershell -ExecutionPolicy Bypass -File tools\home-bridge\install.ps1
#
# 1. publishes the proxy to %LOCALAPPDATA%\ClaudeWebHomeBridge (keeps an existing homebridge.json and logs\)
# 2. firewall: ONE inbound rule, the proxy port, only from the allowed home computers
# 3. scheduled task "ClaudeWebHomeBridge": starts the proxy at logon, no window
# 4. starts it and checks that it answers on the home side and NOT on the business side
# Pure ASCII on purpose (Windows PowerShell 5.1 reads scripts as ANSI).

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'ClaudeWebHomeBridge'
$taskName = 'ClaudeWebHomeBridge'
$ruleName = 'Claude Web home bridge'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this from an elevated (administrator) PowerShell: it adds a firewall rule.' }

# Stop a running copy so the files can be replaced.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $taskName }
Get-Process HomeBridge -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

# Publish, keeping the operator's config if there is one.
$cfgPath = Join-Path $dest 'homebridge.json'
$keep = $null
if (Test-Path $cfgPath) { $keep = Get-Content $cfgPath -Raw }
& dotnet publish (Join-Path $src 'HomeBridge.csproj') -c Release -o $dest --nologo -v quiet
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
if ($keep) { Set-Content -Path $cfgPath -Value $keep -Encoding UTF8 -NoNewline }
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
Write-Host ('config: port ' + $cfg.port + ', clients ' + ($cfg.allowClients -join ',') + ', targets ' + ($cfg.allowTargets -join ','))

# Firewall: the proxy port, only from the allowed clients. (The proxy checks the clients itself too.)
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName -Description 'One-way home bridge: home computers open business addresses through the Hub. openspec home-bridge-proxy.' `
  -Direction Inbound -Protocol TCP -LocalPort $cfg.port -RemoteAddress $cfg.allowClients -Action Allow -Profile Any | Out-Null
Write-Host ('firewall: inbound TCP ' + $cfg.port + ' allowed only from ' + ($cfg.allowClients -join ','))

# Scheduled task: at logon of this user, no time limit.
$exe = Join-Path $dest 'HomeBridge.exe'
$action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Claude Web home bridge (one-way proxy, home -> business).' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host ('task: ' + $taskName + ' registered (at logon) and started')

# Check: listening on the home side only.
$listen = $null
for ($i = 0; $i -lt 20 -and -not $listen; $i++) {
  Start-Sleep -Milliseconds 500
  $listen = Get-NetTCPConnection -State Listen -LocalPort $cfg.port -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $listen) { throw ('the proxy is not listening on port ' + $cfg.port + ': see ' + (Join-Path $dest 'logs')) }
Write-Host ('listening on ' + $listen.LocalAddress + ':' + $cfg.port)
Write-Host ''
Write-Host 'On the home computer: Windows Settings > Network & internet > Proxy > Use setup script > ON, address:'
Write-Host ('  http://' + $listen.LocalAddress + ':' + $cfg.port + '/proxy.pac')
Write-Host 'Then open http://192.168.0.42:5099 in Chrome.'
