# openspec arch-memory-store (fleet task 0953472c) - live check on the hub machine without deploying: ONE isolated
# harness built from this branch on 127.0.0.1:5271 with its own data dir (copies of the live store) and a COPY of
# the arch home (memory/*.md + its git history), so the first-run import reads the real memory files while the real
# arch home is never touched. Then Playwright (memlab.mjs) drives the Memory tab and a real arch turn.
# Kills only its own PID. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bin = Join-Path $PSScriptRoot 'bin'
$port = 5271
$pw = 'lab-mem-' + (Get-Random -Maximum 99999)
$hub = "http://127.0.0.1:$port"
$stamp = [guid]::NewGuid().ToString('N').Substring(0, 8)
$data = Join-Path $env:TEMP "cw-memlab-$stamp"
$home2 = Join-Path $data 'arch-home'
New-Item -ItemType Directory -Force $data | Out-Null
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { "ERROR: port $port is already taken"; exit 1 }

Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match ' error ' }
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

foreach ($f in 'repositories.json','dock.json','sessions.json','taskgraph.json','flags.json') { $s = Join-Path $env:APPDATA "ClaudeWeb\$f"; if (Test-Path $s) { Copy-Item $s $data } }
# The gate is OPEN in the lab: an Operator send to the arch needs it, and no loops.json is copied, so nothing else can run.
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
$liveHome = Join-Path (Split-Path $repo) 'arch-home'
# The live home's state BEFORE the lab (it may already carry the live harness's uncommitted files): it must be identical after.
$liveBefore = (& git -C $liveHome status --porcelain | Out-String) + (& git -C $liveHome rev-parse HEAD | Out-String)
& robocopy $liveHome $home2 /E /NFL /NDL /NJH /NJS /NP | Out-Null
"arch home copied: " + (Get-ChildItem (Join-Path $home2 'memory') -Filter *.md).Count + " memory files"

$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''
$env:CLAUDEWEB_ARCHHOMEDIR = $home2; $env:CLAUDEWEB_PROXY_NO_BROWSER = '1'
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
  $env:HUB = $hub; $env:HUBPW = $pw; $env:OUT = $PSScriptRoot; $env:LABDATA = $data; $env:LABHOME = $home2
  Push-Location "$repo\.preview-test"
  Copy-Item "$PSScriptRoot\memlab.mjs" "$repo\.preview-test\memlab-run.mjs" -Force   # ESM resolves playwright from the script's folder
  & node "$repo\.preview-test\memlab-run.mjs"
  "node exit $LASTEXITCODE"
  Pop-Location
  $liveAfter = (& git -C $liveHome status --porcelain | Out-String) + (& git -C $liveHome rev-parse HEAD | Out-String); "real arch home untouched by the lab: " + ($liveAfter -eq $liveBefore)
} catch { "ERROR: $($_.Exception.Message)" }
finally {
  if ($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Sleep -Milliseconds 800
  if ($p) { "isolated pid $($p.Id) still alive: " + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue) }
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
  "live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
}
