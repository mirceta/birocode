# openspec harness-tabs-left-window (fleet task d3af3b9b) — live check on the hub machine without deploying: TWO isolated
# harnesses built from this branch, each on its own port + data dir with copies of the live store
# (repos, docks, sessions, recurring cards; autopilot gate closed): HUB on 127.0.0.1:5251 and PEER on
# localhost:5252 (another host name, so cookies stay apart). The hub subscribes to the peer with the
# peer's password, then Playwright (leftwin.mjs) drives REAL Chrome (headed, its own profile) through the two-window checks.
# Kills only its own PIDs. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bin = Join-Path $PSScriptRoot 'bin'
$hubPort = 5261; $peerPort = 5262
$hubPw = 'lab-hub-' + (Get-Random -Maximum 99999); $peerPw = 'lab-peer-' + (Get-Random -Maximum 99999)
$hub = "http://127.0.0.1:$hubPort"; $peer = "http://localhost:$peerPort"
$stamp = [guid]::NewGuid().ToString('N').Substring(0, 8)
$hubData = Join-Path $env:TEMP "cw-leftwin-hub-$stamp"; $peerData = Join-Path $env:TEMP "cw-leftwin-peer-$stamp"
New-Item -ItemType Directory -Force $hubData, $peerData | Out-Null
foreach ($port in $hubPort, $peerPort) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { "ERROR: port $port is already taken"; exit 1 }
}

Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match ' error ' }
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

foreach ($d in $hubData, $peerData) {
  foreach ($f in 'repositories.json','dock.json','sessions.json','taskgraph.json','flags.json','arch.json','recurring.json') { $s = Join-Path $env:APPDATA "ClaudeWeb\$f"; if (Test-Path $s) { Copy-Item $s $d } }
  Set-Content -Path (Join-Path $d 'autopilot-gate.json') -Value '{"enabled":false}' -Encoding ascii
}
function Start-Iso($data, $port, $pw) {
  $env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''
  $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home'); $env:CLAUDEWEB_PROXY_NO_BROWSER = '1'
  $p = Start-Process -FilePath "$bin\ClaudeWeb.exe" -WorkingDirectory $bin -PassThru -WindowStyle Minimized
  for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 500
    $owner = (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    if ($owner -eq $p.Id) { return $p }
  }
  throw "the isolated harness pid $($p.Id) did not listen on $port"
}
$ph = $null; $pp = $null
try {
  $ph = Start-Iso $hubData $hubPort $hubPw; "hub pid $($ph.Id) on $hubPort"
  $pp = Start-Iso $peerData $peerPort $peerPw; "peer pid $($pp.Id) on $peerPort"
  $body = @{ address = $peer; label = 'PEER-LAB'; credential = $peerPw } | ConvertTo-Json
  $src = Invoke-RestMethod -Method Post -Uri "$hub/api/collector/sources" -Headers @{ 'X-Auth-Password' = $hubPw } -ContentType 'application/json' -Body $body
  "hub subscribed to the peer: source $($src.id)"
  $env:HUB = $hub; $env:PEER = $peer; $env:HUBPW = $hubPw; $env:PEERPW = $peerPw; $env:SID = $src.id; $env:OUT = $PSScriptRoot
  Push-Location "$repo\.preview-test"
  Copy-Item "$PSScriptRoot\leftwin.mjs" "$repo\.preview-test\leftwin-run.mjs" -Force   # ESM resolves playwright from the script's folder
  if (-not $env:SKIP_MAIN) { & node "$repo\.preview-test\leftwin-run.mjs" }
  "node exit $LASTEXITCODE"
  Copy-Item "$PSScriptRoot\leftwin-drag.mjs" "$repo\.preview-test\leftwin-drag-run.mjs" -Force
  & node "$repo\.preview-test\leftwin-drag-run.mjs"
  "node (drag) exit $LASTEXITCODE"
  Pop-Location
} catch { "ERROR: $($_.Exception.Message)" }
finally {
  foreach ($p in $ph, $pp) { if ($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} } }
  Start-Sleep -Milliseconds 800
  foreach ($p in $ph, $pp) { if ($p) { "isolated pid $($p.Id) still alive: " + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue) } }
  try { Remove-Item -Recurse -Force $hubData, $peerData -ErrorAction SilentlyContinue } catch {}
  "live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
}
