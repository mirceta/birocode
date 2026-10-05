# openspec tabbed-agent-tab: boot a BUILT harness on an isolated data dir + port (the exe in
# .selfdev-build/requests/bin with client/dist staged beside it), then drive it with Playwright
# (client/tests/ui/e2e-agent-tab.mjs). Prints the node script's JSON. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\requests\bin\ClaudeWeb.exe"
$port = 5239; $pw = 'iso-agenttab-5521'; $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-agenttab-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
Set-Content -Path (Join-Path $data 'arch.json') -Value '{"AcceptFleetSends":true}' -Encoding ascii
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
try {
  if (-not $ok) { throw "the isolated harness did not answer on $port" }
  $env:BASE = $base; $env:PW = $pw
  Push-Location $repo
  & node client\tests\ui\e2e-agent-tab.mjs
  Pop-Location
} catch {
  Write-Output ('{"error":"' + $_.Exception.Message + '"}')
} finally {
  try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 500
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
}
