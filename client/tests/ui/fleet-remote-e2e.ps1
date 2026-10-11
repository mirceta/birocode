# openspec remote-fleet-agents: TWO isolated harnesses from one build — a HUB (the one the phone pairs
# with) and a PEER (a fleet computer) — each on its own port + data dir (this machine's dock / sessions
# / repos copied to both, autopilot gate closed). The hub subscribes to the peer as a collector source
# with the peer's password (the fleet credential), then Playwright drives a projector + a phone
# (client/tests/ui/e2e-fleet-remote.mjs). Prints the node script's JSON. Kills only its own PIDs. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot "......")).Path  # resolved from client/tests/ui, so it runs on any checkout
$bin = "$repo\.claudeweb-preview\sofa-bin"
$hubPort = 5241; $peerPort = 5242
$hubPw = 'iso-hub-' + (Get-Random -Maximum 99999); $peerPw = 'iso-peer-' + (Get-Random -Maximum 99999)
# The peer on a DIFFERENT host name: browser cookies ignore the port, so two harnesses on 127.0.0.1 would
# overwrite each other's session cookie in the projector (in the fleet the hub and a peer are different hosts).
$hub = "http://127.0.0.1:$hubPort"; $peer = "http://localhost:$peerPort"
$stamp = [guid]::NewGuid().ToString('N').Substring(0, 8)
$hubData = Join-Path $env:TEMP "cw-fleet-e2e-hub-$stamp"; $peerData = Join-Path $env:TEMP "cw-fleet-e2e-peer-$stamp"
$shots = "$repo\.claudeweb-preview\fleet-shots"
New-Item -ItemType Directory -Force $hubData, $peerData, $shots | Out-Null

Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match 'error' }
# The exe finds the bundle at <bin>\client\dist (EmbeddedApi: client/dist relative to the build output).
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

foreach ($d in $hubData, $peerData) {
  foreach ($f in 'repositories.json','dock.json','sessions.json','taskgraph.json','flags.json','arch.json') { $s = Join-Path $env:APPDATA "ClaudeWeb\$f"; if (Test-Path $s) { Copy-Item $s $d } }
  Set-Content -Path (Join-Path $d 'autopilot-gate.json') -Value '{"enabled":false}' -Encoding ascii
}
function Start-Iso($data, $port, $pw) {
  $env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
  $p = Start-Process -FilePath "$bin\ClaudeWeb.exe" -WorkingDirectory $bin -PassThru -WindowStyle Minimized
  $ok = $false
  for ($i = 0; $i -lt 80; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
  if (-not $ok) { throw "the isolated harness did not answer on $port" }
  return $p
}
$ph = $null; $pp = $null
try {
  $ph = Start-Iso $hubData $hubPort $hubPw; "hub pid $($ph.Id) up on $hubPort"
  $pp = Start-Iso $peerData $peerPort $peerPw; "peer pid $($pp.Id) up on $peerPort"
  # The hub subscribes to the peer with the peer's password — the fleet credential the relay reuses.
  $body = @{ address = $peer; label = 'PEER-E2E'; credential = $peerPw } | ConvertTo-Json
  $src = Invoke-RestMethod -Method Post -Uri "$hub/api/collector/sources" -Headers @{ 'X-Auth-Password' = $hubPw } -ContentType 'application/json' -Body $body
  "hub subscribed to the peer: source $($src.id) status $($src.status)"
  $env:HUB = $hub; $env:PEER = $peer; $env:HUBPW = $hubPw; $env:PEERPW = $peerPw; $env:SID = $src.id; $env:SHOTS = $shots
  Push-Location "$repo\client"
  & node tests\ui\e2e-fleet-remote.mjs
  "node exit $LASTEXITCODE"
  Pop-Location
} catch { "ERROR: $($_.Exception.Message)" }
finally {
  foreach ($p in $ph, $pp) { if ($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} } }
  Start-Sleep -Milliseconds 800
  foreach ($p in $ph, $pp) { if ($p) { "isolated pid $($p.Id) still alive: " + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue) } }
  try { Remove-Item -Recurse -Force $hubData, $peerData -ErrorAction SilentlyContinue } catch {}
  "live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
}
