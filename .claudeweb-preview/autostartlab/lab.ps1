# Fleet task f88f97fe (local-app autostart + sentry) - live check on the hub machine WITHOUT deploying: builds this
# branch once into two isolated bins and lets autostartlab.mjs run TWO isolated harnesses: a lab hub (:5304, a copy of
# the live repositories.json + discovery cache so the tab lists the real apps, nothing flagged) and a lab peer
# "spacex-lab" (:5306, fresh). Only throwaway test apps (ports 47411-47422, node servers in %TEMP%) are flagged,
# started and killed. No arch.json, no loops, no collector sources are copied: nothing can be sent anywhere.
# The script kills only the PIDs it started and the test ports. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bin = Join-Path $PSScriptRoot 'bin'
$binPeer = Join-Path $PSScriptRoot 'bin-peer'
foreach ($p in 5304, 5306) { if (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) { "ERROR: port $p is already taken"; exit 1 } }
Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match ' error ' }
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
& robocopy $bin $binPeer /MIR /XD logs /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location
$env:OUT = $PSScriptRoot; $env:BIN = $bin; $env:BINPEER = $binPeer; $env:LIVEDATA = (Join-Path $env:APPDATA 'ClaudeWeb')
Push-Location "$repo\.preview-test"
Copy-Item "$PSScriptRoot\autostartlab.mjs" "$repo\.preview-test\autostartlab-run.mjs" -Force
& node "$repo\.preview-test\autostartlab-run.mjs"
"node exit $LASTEXITCODE"
Pop-Location
foreach ($p in 5304, 5306, 47411, 47412, 47413, 47414, 47421, 47422) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { "still listening on ${p}: PID $($c.OwningProcess) - stopping"; Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
}
"live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
