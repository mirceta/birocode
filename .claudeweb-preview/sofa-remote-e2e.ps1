# openspec sofa-mode: build the harness to an isolated dir, stage client/dist beside it, boot it on an
# isolated port + data dir (this machine's dock / sessions / repos copied, autopilot gate closed, no
# fleet), then drive it with Playwright (client/tests/ui/e2e-sofa-remote.mjs). Prints the node script's
# JSON. Kills only its own PID. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\admin\Desktop\playground\birocode'
$bin = "$repo\.claudeweb-preview\sofa-bin"
$port = 5241; $pw = 'iso-sofa-' + (Get-Random -Maximum 99999); $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-sofa-e2e-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$shots = "$repo\.claudeweb-preview\sofa-shots"
New-Item -ItemType Directory -Force $data, $shots | Out-Null

Push-Location $repo
& dotnet build ClaudeWeb.App\ClaudeWeb.App.csproj -c Debug -o $bin --nologo -v q 2>&1 | Where-Object { $_ -match 'error' }
# The exe finds the bundle at <bin>\client\dist (EmbeddedApi: client/dist relative to the build output).
& robocopy "$repo\client\dist" "$bin\client\dist" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

foreach ($f in 'repositories.json','dock.json','sessions.json','taskgraph.json','flags.json','arch.json') { $s = Join-Path $env:APPDATA "ClaudeWeb\$f"; if (Test-Path $s) { Copy-Item $s $data } }
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":false}' -Encoding ascii
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
$p = Start-Process -FilePath "$bin\ClaudeWeb.exe" -WorkingDirectory $bin -PassThru -WindowStyle Minimized
$ok = $false
for ($i = 0; $i -lt 80; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
try {
  if (-not $ok) { throw "the isolated harness did not answer on $port" }
  "isolated harness pid $($p.Id) up on $port"
  try { "GET /studio -> " + (Invoke-WebRequest "$base/studio" -UseBasicParsing -TimeoutSec 5 -Headers @{ 'X-Auth-Password' = $pw }).StatusCode } catch { "GET /studio -> " + $_.Exception.Message }
  $env:BASE = $base; $env:PW = $pw; $env:SHOTS = $shots
  Push-Location "$repo\client"
  & node tests\ui\e2e-sofa-remote.mjs
  "node exit $LASTEXITCODE"
  Pop-Location
} catch { "ERROR: $($_.Exception.Message)" }
finally {
  try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 800
  "isolated pid still alive: " + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue)
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
  "live :5099 still " + ((Invoke-WebRequest http://127.0.0.1:5099/api/health -UseBasicParsing -TimeoutSec 3).StatusCode)
}
