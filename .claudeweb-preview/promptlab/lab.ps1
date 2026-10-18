# openspec arch-prompts-tab (fleet task f6add917) - live check on the hub machine without deploying: ONE isolated
# harness built from this branch on 127.0.0.1:5281 with its own data dir (copies of the live store, the live prompt
# library included) and a FRESH arch home, so a real arch turn never touches the live arch. -Mode before is run with
# origin/main's committed Management bundle checked out into the tree (the harness serves the bundle from its own
# checkout and re-points its own repo entry at startup, so a registry swap cannot do it).
# Kills only its own PID. ASCII only.
param([string]$Mode = 'after')
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bin = Join-Path $PSScriptRoot 'bin'
$port = 5281
$pw = 'lab-pr-' + (Get-Random -Maximum 99999)
$hub = "http://127.0.0.1:$port"
$stamp = [guid]::NewGuid().ToString('N').Substring(0, 8)
$data = Join-Path $env:TEMP "cw-promptlab-$stamp"
New-Item -ItemType Directory -Force $data, (Join-Path $data 'arch-home') | Out-Null
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { "ERROR: port $port is already taken"; exit 1 }

Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match ' error ' }
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

foreach ($f in 'repositories.json','dock.json','sessions.json','taskgraph.json','flags.json','prompts.json') { $s = Join-Path $env:APPDATA "ClaudeWeb\$f"; if (Test-Path $s) { Copy-Item $s $data } }
# The gate is OPEN in the lab: an Operator send to the arch needs it, and no loops.json is copied, so nothing else can run.
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii

$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''
$env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home'); $env:CLAUDEWEB_PROXY_NO_BROWSER = '1'
$p = $null
try {
  $p = Start-Process -FilePath "$bin\ClaudeWeb.exe" -WorkingDirectory $bin -PassThru -WindowStyle Minimized
  $up = $false
  for ($i = 0; $i -lt 80 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 500
    $owner = (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    $up = ($owner -eq $p.Id)
  }
  if (-not $up) { throw "the isolated harness pid $($p.Id) did not listen on $port" }
  "lab pid $($p.Id) on $port"
  $env:HUB = $hub; $env:HUBPW = $pw; $env:OUT = $PSScriptRoot; $env:MODE = $Mode
  Push-Location "$repo\.preview-test"
  Copy-Item "$PSScriptRoot\promptlab.mjs" "$repo\.preview-test\promptlab-run.mjs" -Force   # ESM resolves playwright from the script's folder
  & node "$repo\.preview-test\promptlab-run.mjs"
  "node exit $LASTEXITCODE"
  Pop-Location
} catch { "ERROR: $($_.Exception.Message)" }
finally {
  if ($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Sleep -Milliseconds 800
  if ($p) { "isolated pid $($p.Id) still alive: " + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue) }
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
  "live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
}
