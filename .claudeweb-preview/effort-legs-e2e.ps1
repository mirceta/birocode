# openspec cross-repo-effort-legs: isolated instance (own data dir, copy of the live registry),
# then playwright/check-effort-legs-api.mjs exercises the legs endpoints, the verifier on an
# agentless checkout, the done-claim verdict and the repo-agent MCP endpoint. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\legs\bin\ClaudeWeb.exe"
$port = 5229; $pw = 'iso-legs-7731'; $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-legs-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
Push-Location "$repo\.claudeweb-preview\playwright"
$env:PORT = "$port"; $env:PW = $pw
& node check-effort-legs-api.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
"harness stopped; check exit $code"
exit $code
