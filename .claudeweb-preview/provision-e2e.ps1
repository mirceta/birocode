# openspec provision-repo-agent: two isolated instances of the provision build on this box (a hub
# and a peer, each with its OWN temp data dir — the live harness is never touched), driven by
# playwright/check-provision.mjs. The throwaway checkout lands next to the other checkouts
# (playground/provision-test-20261007) and is deleted again at the end.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\provision\bin\ClaudeWeb.exe"
$peerPort = 5241; $hubPort = 5242
$peerPw = 'iso-prov-peer'; $hubPw = 'iso-prov-hub'
$name = 'provision-test-20261007'
$checkout = Join-Path (Split-Path $repo) $name

function Start-Iso($port, $pw, $tag) {
  $data = Join-Path $env:TEMP ("cw-prov-$tag-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force $data | Out-Null
  Set-Content -Path (Join-Path $data "autopilot-gate.json") -Value "{`"enabled`":true}" -Encoding ascii
  $env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''
  $p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
  "booted $tag pid $($p.Id) port $port health=$ok data=$data"
  return $p
}

if (Test-Path $checkout) { "pre-existing $checkout - removing"; Remove-Item -Recurse -Force $checkout }
$peer = Start-Iso $peerPort $peerPw 'peer'
$hub = Start-Iso $hubPort $hubPw 'hub'
Start-Sleep -Seconds 3
Push-Location "$repo\.claudeweb-preview\playwright"
$env:HUB_PORT = "$hubPort"; $env:PEER_PORT = "$peerPort"; $env:HUB_PW = $hubPw; $env:PEER_PW = $peerPw; $env:PROV_NAME = $name
& node check-provision.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $peer.Id -Force
Stop-Process -Id $hub.Id -Force
Start-Sleep -Seconds 2
if (Test-Path $checkout) { "removing the test checkout $checkout"; Remove-Item -Recurse -Force $checkout }
"harness instances stopped; check exit $code; checkout gone: $(-not (Test-Path $checkout))"
exit $code
