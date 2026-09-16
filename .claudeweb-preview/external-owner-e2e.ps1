# openspec kanban-external-owner: isolated instance (own data dir, copy of the live registry),
# then playwright/check-external-owner-api.mjs exercises the owner endpoints, the verifier's
# skip and the board verdict. ASCII only (Windows PowerShell 5.1 without a BOM).
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\extowner\bin\ClaudeWeb.exe"
$port = 5228; $pw = 'iso-owner-2291'; $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-owner-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
Push-Location "$repo\.claudeweb-preview\playwright"
$env:PORT = "$port"; $env:PW = $pw
& node check-external-owner-api.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
"harness stopped; check exit $code"
exit $code
