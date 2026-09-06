# openspec arch-goal-conversations: isolated instance (copies of the live registry only; its own arch home), a goal conversation started in suggest mode (no CLI turn): ownership, busy, routing to the inbox, the Management App surfaces, release on stop.
# ideas files (the live data dir is never touched) -> backfill numbers the real ideas
# and disambiguates repeated repo names; the tools resolve handles.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\p3check\bin\ClaudeWeb.exe"
$port = 5221; $pw = 'iso-goals-4472'; $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-goals-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
Copy-Item "$env:APPDATA\ClaudeWeb\notes.json" $data
Set-Content -Path (Join-Path $data "autopilot-gate.json") -Value "{`"enabled`":true}" -Encoding ascii
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
Push-Location "$repo\.claudeweb-preview\playwright"
$env:PORT = "$port"; $env:PW = $pw
& node check-arch-goals.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
"harness stopped; check exit $code"
exit $code
