# Fleet task 61a0d521 (Status tab pinned agents) - live check on the hub machine without deploying: ONE isolated harness built
# from this branch on 127.0.0.1:5307 with its own data dir, a copy of the live registry/docks/fleet sources and a FRESH,
# unarmed arch. Kills only its own PID. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bin = Join-Path $PSScriptRoot 'bin'
$port = 5307
$pw = 'lab-pin-' + (Get-Random -Maximum 99999)
$hub = "http://127.0.0.1:$port"
$stamp = [guid]::NewGuid().ToString('N').Substring(0, 8)
$data = Join-Path $env:TEMP "cw-pinlab-$stamp"
New-Item -ItemType Directory -Force $data, (Join-Path $data 'arch-home') | Out-Null
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { "ERROR: port $port is already taken"; exit 1 }

Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match ' error ' }
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

# The real fleet: the live registry, docks and collector sources (so the Status tab lists every machine's agents).
# NOT copied: arch.json, loops.json, recurring - the lab's arch is fresh and unarmed, the gate is closed, so nothing
# can be sent; the lab only reads the fleet status and pins / unpins (a hub-local file).
foreach ($f in 'repositories.json','dock.json','sessions.json','taskgraph.json','flags.json','collector-sources.json') { $s = Join-Path $env:APPDATA "ClaudeWeb\$f"; if (Test-Path $s) { Copy-Item $s $data } }
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":false}' -Encoding ascii

$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''
$env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home'); $env:CLAUDEWEB_PROXY_NO_BROWSER = '1'
# The stored peer credentials are data-protected with the key ring of the LIVE build's content root (the default
# application discriminator). The lab reads the same keys by claiming that content root; nothing in the harness
# writes relative to it (logs go under the lab's own bin), so the live folder is not touched.
$env:ASPNETCORE_CONTENTROOT = (Join-Path $repo '.selfdev-build\run-bin')
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
  $env:HUB = $hub; $env:HUBPW = $pw; $env:OUT = $PSScriptRoot
  Push-Location "$repo\.preview-test"
  Copy-Item "$PSScriptRoot\pinlab.mjs" "$repo\.preview-test\pinlab-run.mjs" -Force   # ESM resolves playwright from the script's folder
  & node "$repo\.preview-test\pinlab-run.mjs"
  "node exit $LASTEXITCODE"
  Pop-Location
  "lab arch tool calls (must be none that send): " + ((Select-String -Path (Join-Path $bin 'logs\*.log') -Pattern 'send_task|upgrade_peer|start_loop|provision' -SimpleMatch -ErrorAction SilentlyContinue | Measure-Object).Count)
} catch { "ERROR: $($_.Exception.Message)" }
finally {
  if ($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Sleep -Milliseconds 800
  if ($p) { "isolated pid $($p.Id) still alive: " + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue) }
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
  "live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
}
